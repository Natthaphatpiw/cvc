const BASE = 'https://app.invalid';

// Browsers drop tabs/newlines from URLs and read '\' as '/', so '/\t/evil.example' resolves to another host.
function isAppPath(s: string): boolean {
  return s.startsWith('/') && !s.startsWith('//') && !/[\s\u0000-\u001F\u007F\\]/.test(s) && !s.startsWith('/liff');
}

/** Only same-origin app paths; never back into /liff (loop) or anything a browser could resolve to another origin. */
export function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return '/';
  let decoded: string;
  try {
    decoded = decodeURIComponent(v);
  } catch {
    return '/';
  }
  if (!isAppPath(v) || !isAppPath(decoded)) return '/';
  let url: URL;
  try {
    url = new URL(v, BASE);
  } catch {
    return '/';
  }
  // Re-check after dot-segment normalisation ('/.//evil.example' has pathname '//evil.example').
  const out = `${url.pathname}${url.search}${url.hash}`;
  return url.origin === BASE && isAppPath(out) ? out : '/';
}
