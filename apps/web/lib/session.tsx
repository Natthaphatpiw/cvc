'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { MeResponse } from '@cvc/schemas';
import { ApiError, setSessionGate, systemApi } from './api';
import { NOTICE_VERSION, isLineLoginConfigured } from './config';
import { isLiffSession, logoutLiff } from './liff';
import { localStore } from './local-store';
import { getSupabase } from './supabase';

export type SessionStatus = 'loading' | 'guest' | 'line';

export type SessionValue = {
  status: SessionStatus;
  /** Profile from /api/me (LINE users only). */
  user: MeResponse | null;
  /** Opened inside LINE (LIFF) or on a /liff route. */
  isLiff: boolean;
  /** Starts LINE login: goes to /liff, which runs liff.login() and comes back to the current page. */
  loginWithLine(): Promise<void>;
  logout(): Promise<void>;
  /** LIFF ID and Supabase are both configured, so LINE login can work. */
  canLoginWithLine: boolean;
  /** Exchanges a LIFF ID token for a session, bootstraps the profile and claims this browser's guest runs. */
  completeLineLogin(idToken: string): Promise<MeResponse | null>;
  /** Records the privacy notice acknowledgement for the current version, then refreshes the profile. */
  acknowledgeNotice(): Promise<void>;
  refreshUser(): Promise<void>;
  /** Bumps when guest runs were moved to the LINE account in the background; history lists refetch on change. */
  claimRevision: number;
};

type Snapshot = { status: 'guest' | 'line'; user: MeResponse | null };

const GUEST: Snapshot = { status: 'guest', user: null };

let bootPromise: Promise<Snapshot> | null = null;

const NO_GUEST_SESSION_KEY = 'cvc:guest-session-unavailable';

function guestSessionUnavailable(): boolean {
  try {
    return window.sessionStorage.getItem(NO_GUEST_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

async function createGuestSession(): Promise<void> {
  const sb = getSupabase();
  if (!sb || guestSessionUnavailable()) return;
  try {
    const tokens = await systemApi.guest(NOTICE_VERSION);
    await sb.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  } catch (e) {
    // 501 supabase_not_configured = local demo mode on the API: requests use x-cvc-guest-id instead.
    // Remember it for this tab so every page load does not ask again. Other failures (offline) retry next load.
    if (e instanceof ApiError && e.status === 501) {
      try {
        window.sessionStorage.setItem(NO_GUEST_SESSION_KEY, '1');
      } catch {
        // ignore
      }
    }
  }
}

async function boot(): Promise<Snapshot> {
  const sb = getSupabase();
  if (!sb) return GUEST;
  let session = null;
  try {
    session = (await sb.auth.getSession()).data.session;
  } catch {
    session = null;
  }
  if (!session) {
    await createGuestSession();
    return GUEST;
  }
  if (session.user.is_anonymous) return GUEST;
  try {
    const user = await systemApi.me({ waitForSession: false });
    return { status: 'line', user };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
      await createGuestSession();
      return GUEST;
    }
    if (e instanceof ApiError && e.status === 404) {
      // Signed in with LINE but the app profile was never created (bootstrap interrupted): create it now.
      const user = await systemApi.bootstrap({ waitForSession: false }).catch(() => null);
      return { status: 'line', user };
    }
    // Offline or API down: keep the LINE session, the profile loads on refresh.
    return { status: 'line', user: null };
  }
}

function getBoot(): Promise<Snapshot> {
  bootPromise ??= boot();
  return bootPromise;
}

/** ClaimRequest accepts at most 50 items per call. */
const CLAIM_BATCH = 50;

/**
 * Moves this browser's guest runs to the LINE account in batches. Best effort, never throws.
 * Resolves true when at least one batch was accepted.
 */
async function claimGuestRuns(): Promise<boolean> {
  const runs = await localStore.listRuns();
  const claimable = runs.filter((r): r is typeof r & { claimSecret: string } => typeof r.claimSecret === 'string');
  let claimed = false;
  for (let i = 0; i < claimable.length; i += CLAIM_BATCH) {
    const batch = claimable.slice(i, i + CLAIM_BATCH);
    try {
      await systemApi.claim(
        batch.map((r) => ({ runId: r.runId, claimSecret: r.claimSecret })),
        { waitForSession: false },
      );
    } catch {
      break; // keep the remaining secrets: retried on the next session restore
    }
    claimed = true;
    // Only this batch was sent. Its unclaimed runs expired on the server, so their secrets are useless now.
    await Promise.all(batch.map((r) => localStore.updateRun(r.runId, { claimSecret: null })));
  }
  return claimed;
}

async function syncSavedResults(): Promise<void> {
  const saved = await localStore.listSavedResults();
  await Promise.allSettled(
    saved.slice(0, 20).map((s) => systemApi.saveResult({ resultId: s.resultId, title: s.title }, { waitForSession: false })),
  );
}

/** Moves this browser's guest runs (and saved results) to the LINE account. Best effort, never throws. */
async function claimGuestData(): Promise<void> {
  await claimGuestRuns();
  await syncSavedResults();
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [snap, setSnap] = useState<{ status: SessionStatus; user: MeResponse | null }>(() => {
    // Register the gate before any child effect fires a request (child effects run before this provider's).
    if (typeof window !== 'undefined') setSessionGate(getBoot());
    return { status: 'loading', user: null };
  });
  const [liffSession, setLiffSession] = useState(false);
  const [claimRevision, setClaimRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const p = getBoot();
    setSessionGate(p);
    void p.then(async (s) => {
      if (!active) return;
      setSnap(s);
      // A claim that failed during LINE login is retried once per page load while claim secrets are left.
      if (s.status !== 'line' || !(await claimGuestRuns())) return;
      await syncSavedResults();
      if (active) setClaimRevision((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setLiffSession(isLiffSession());
  }, [pathname]);

  const isLiff = (pathname ?? '').startsWith('/liff') || liffSession;

  const loginWithLine = useCallback(async () => {
    if (!isLineLoginConfigured()) return;
    const here = `${window.location.pathname}${window.location.search}`;
    const next = here.startsWith('/liff') ? '/' : here;
    window.location.assign(`/liff?login=1&next=${encodeURIComponent(next)}`);
  }, []);

  const completeLineLogin = useCallback(async (idToken: string) => {
    const sb = getSupabase();
    if (!sb) {
      throw new ApiError(501, 'supabase_not_configured', 'ยังไม่ได้ตั้งค่าระบบบัญชีผู้ใช้ จึงเข้าสู่ระบบด้วย LINE ไม่ได้');
    }
    const previous = bootPromise;
    const p = (async (): Promise<Snapshot> => {
      const tokens = await systemApi.lineExchange(idToken);
      const { error } = await sb.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
      if (error) throw new ApiError(401, 'session_failed', 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง');
      let user: MeResponse | null = null;
      try {
        user = await systemApi.bootstrap({ waitForSession: false });
      } catch {
        user = null;
      }
      await claimGuestData();
      return { status: 'line', user };
    })();
    bootPromise = p;
    setSessionGate(p);
    try {
      const next = await p;
      setSnap(next);
      return next.user;
    } catch (e) {
      bootPromise = previous;
      setSessionGate(previous);
      throw e;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const user = await systemApi.me();
      setSnap({ status: 'line', user });
    } catch {
      // keep the current profile
    }
  }, []);

  const acknowledgeNotice = useCallback(async () => {
    await systemApi.consent({ consentType: 'privacy_notice_ack', version: NOTICE_VERSION, granted: true });
    await refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    logoutLiff();
    const sb = getSupabase();
    const p = (async (): Promise<Snapshot> => {
      if (sb) await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
      await createGuestSession();
      return GUEST;
    })();
    bootPromise = p;
    setSessionGate(p);
    setSnap({ status: 'loading', user: null });
    setSnap(await p);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status: snap.status,
      user: snap.user,
      isLiff,
      loginWithLine,
      logout,
      canLoginWithLine: isLineLoginConfigured(),
      completeLineLogin,
      acknowledgeNotice,
      refreshUser,
      claimRevision,
    }),
    [snap, isLiff, loginWithLine, logout, completeLineLogin, acknowledgeNotice, refreshUser, claimRevision],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
