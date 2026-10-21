import type { Liff } from '@line/liff';
import { liffId } from './config';

export { isLiffConfigured, liffId } from './config';

const LIFF_SESSION_KEY = 'cvc:liff';

let liffPromise: Promise<Liff> | null = null;
let liffInstance: Liff | null = null;

/** Loads the LIFF SDK on demand (keeps it out of the main bundle). */
export async function loadLiff(): Promise<Liff> {
  const mod = await import('@line/liff');
  return mod.default;
}

/**
 * Initializes LIFF once per page. Must run on the LIFF endpoint (/liff…): LINE resolves the login redirect there.
 * Rejects when NEXT_PUBLIC_LIFF_ID is not set.
 */
export function initLiff(): Promise<Liff> {
  const id = liffId();
  if (!id) return Promise.reject(new Error('NEXT_PUBLIC_LIFF_ID is not set'));
  liffPromise ??= (async () => {
    const liff = await loadLiff();
    await liff.init({ liffId: id });
    liffInstance = liff;
    if (liff.isInClient()) markLiffSession();
    return liff;
  })().catch((e: unknown) => {
    liffPromise = null;
    throw e;
  });
  return liffPromise;
}

/** The initialized SDK, or null when this page has not run initLiff(). */
export function getInitializedLiff(): Liff | null {
  return liffInstance;
}

/**
 * Logs out of LIFF and forgets the tokens the SDK keeps in this browser, also on pages that never ran initLiff().
 * Outside LINE the SDK stores them in localStorage as `LIFF_STORE:<liffId>:*` with the `LIFF_STORE:expires:<liffId>`
 * cookie, and getIDToken() returns them without an exp check, so a later login would reuse a stale ID token.
 */
export function logoutLiff(): void {
  try {
    if (liffInstance?.isLoggedIn()) liffInstance.logout();
  } catch {
    // fall through to the manual cleanup
  }
  const id = liffId();
  if (!id || typeof window === 'undefined') return;
  const prefix = `LIFF_STORE:${id}:`;
  for (const storage of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const s = storage();
      for (const key of Object.keys(s)) if (key.startsWith(prefix)) s.removeItem(key);
    } catch {
      // storage blocked
    }
  }
  document.cookie = `LIFF_STORE:expires:${id}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

/** Remembers for this tab that the app was opened inside LINE, so later screens keep the LIFF behaviour. */
export function markLiffSession(): void {
  try {
    window.sessionStorage.setItem(LIFF_SESSION_KEY, '1');
  } catch {
    // ignore
  }
}

export function isLiffSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem(LIFF_SESSION_KEY) === '1') return true;
  } catch {
    // ignore
  }
  return liffInstance?.isInClient() ?? false;
}

/** Opens a URL outside the LINE WebView when running in LIFF, otherwise in a new tab. */
export function openExternal(url: string): void {
  const liff = liffInstance;
  if (liff?.isInClient()) {
    liff.openWindow({ url, external: true });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
