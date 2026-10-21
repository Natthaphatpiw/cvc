import { HTTPFetchError, messagingApi } from '@line/bot-sdk';
import { sha256Hex } from '@cvc/auth';
import { AppError, MSG } from './errors';
import { env } from './env';
import { isRecord, str } from './http';

export const LINE_USER_ID = /^U[0-9a-f]{32}$/;

export type LineIdentity = { sub: string; name: string | null; picture: string | null };

/**
 * Verifies a LIFF / LINE Login ID token with LINE's own endpoint (signature, exp, aud = our channel, nonce-free).
 * https://developers.line.biz/en/reference/line-login/#verify-id-token
 */
export async function verifyLineIdToken(idToken: string): Promise<LineIdentity> {
  const channelId = env.lineLoginChannelId();
  if (!channelId) throw new AppError(501, 'line_not_configured', MSG.lineLoginNotConfigured);

  let res: Response;
  try {
    res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError(502, 'line_unavailable', MSG.upstream);
  }
  const body: unknown = await res.json().catch(() => null);
  const invalid = new AppError(401, 'line_token_invalid', 'ยืนยันตัวตนกับ LINE ไม่สำเร็จ กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง');
  if (!res.ok || !isRecord(body)) throw invalid;

  const sub = str(body.sub);
  if (!sub || !LINE_USER_ID.test(sub) || body.aud !== channelId || body.iss !== 'https://access.line.me') throw invalid;
  return { sub, name: str(body.name), picture: str(body.picture) };
}

/** Deterministic UUID for `X-Line-Retry-Key`, so a retried notify for the same key is not pushed twice. */
export async function retryKeyFor(seed: string): Promise<string> {
  const h = await sha256Hex(seed);
  const variant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type PushOutcome = 'sent' | 'duplicate' | 'quota';

export async function pushLineText(to: string, text: string, retryKey: string): Promise<PushOutcome> {
  const channelAccessToken = env.lineMessagingToken();
  if (!channelAccessToken) throw new AppError(501, 'line_not_configured', MSG.lineMessagingNotConfigured);
  const client = new messagingApi.MessagingApiClient({ channelAccessToken });
  try {
    await client.pushMessage({ to, messages: [{ type: 'text', text }] }, retryKey);
    return 'sent';
  } catch (e) {
    if (e instanceof HTTPFetchError) {
      if (e.status === 409) return 'duplicate'; // same retry key already accepted
      if (e.status === 429) return 'quota'; // monthly push quota or rate limit
    }
    throw e;
  }
}
