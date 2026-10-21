'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { MeResponse } from '@cvc/schemas';
import { ApiError, setSessionGate, setSessionRecovery, systemApi } from './api';
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

/**
 * Set only when the API answered 501 supabase_not_configured (the server really has no Supabase, so the local demo's
 * x-cvc-guest-id works there). Kept for 10 minutes, then the tab asks again in case the server was configured since.
 * Any other failure (guest sign-ins disabled in Supabase, 429, 5xx, offline) is not remembered: the next request that
 * needs a session tries again (see setSessionRecovery in ./api).
 */
const DEMO_MODE_KEY = 'cvc:guest-demo-mode-at';
const DEMO_MODE_TTL_MS = 10 * 60_000;
/** Written by earlier builds for any 501 and never expired, which left a tab without a session for good. */
const LEGACY_NO_GUEST_KEY = 'cvc:guest-session-unavailable';
/**
 * Backoff between failed attempts so a broken setup is not hammered from every request: 15 s doubling to 10 min, and
 * 10 min straight away when the API says guests are switched off or rate-limited (every attempt spends the per-IP
 * guest budget in cvc-api).
 */
const BACKOFF_BASE_MS = 15_000;
const BACKOFF_MAX_MS = 10 * 60_000;

function serverInDemoMode(): boolean {
  try {
    window.sessionStorage.removeItem(LEGACY_NO_GUEST_KEY);
    const at = Number(window.sessionStorage.getItem(DEMO_MODE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DEMO_MODE_TTL_MS;
  } catch {
    return false;
  }
}

let guestInFlight: Promise<boolean> | null = null;
let retryGuestAfter = 0;
let guestFailures = 0;

function noteGuestFailure(e: unknown): void {
  guestFailures += 1;
  const hardStop = e instanceof ApiError && (e.status === 429 || e.code === 'guest_auth_disabled');
  const wait = hardStop ? BACKOFF_MAX_MS : Math.min(BACKOFF_BASE_MS * 2 ** (guestFailures - 1), BACKOFF_MAX_MS);
  retryGuestAfter = Date.now() + wait;
}

/** Creates an anonymous Supabase session through the API. True when a session now exists. Deduplicated. */
async function createGuestSession(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || serverInDemoMode()) return false;
  if (Date.now() < retryGuestAfter) return false;
  guestInFlight ??= (async () => {
    try {
      const tokens = await systemApi.guest(NOTICE_VERSION);
      // supabase-js returns setSession failures instead of throwing
      const { error } = await sb.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
      if (error) throw error;
      guestFailures = 0;
      retryGuestAfter = 0;
      return true;
    } catch (e) {
      noteGuestFailure(e);
      if (e instanceof ApiError && e.status === 501 && e.code === 'supabase_not_configured') {
        try {
          window.sessionStorage.setItem(DEMO_MODE_KEY, String(Date.now()));
        } catch {
          // ignore
        }
      }
      return false;
    } finally {
      guestInFlight = null;
    }
  })();
  return guestInFlight;
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

/**
 * On-demand recovery for requests that find no session. Never for a LINE user: an expired or temporarily unrefreshable
 * LINE session must not be replaced by a new anonymous one (that would hide the account and its history).
 */
async function recoverGuestSession(): Promise<boolean> {
  const snap = await (bootPromise ?? Promise.resolve(null)).catch(() => null);
  if (snap?.status === 'line') return false;
  return createGuestSession();
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
    if (typeof window !== 'undefined') {
      setSessionGate(getBoot());
      setSessionRecovery(recoverGuestSession);
    }
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
