const encoder = new TextEncoder();

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cryptographically random secret, base64url without padding (32 bytes → 43 chars). */
export function randomSecret(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Constant-time string comparison: the loop always covers the longer input and the length difference is folded
 * into the result, so timing does not reveal the position of the first mismatch.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
