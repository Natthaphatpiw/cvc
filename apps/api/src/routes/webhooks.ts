import { Hono } from 'hono';
import { validateSignature, type webhook } from '@line/bot-sdk';
import { getApiStore } from '@cvc/db';
import type { AppEnv } from '../types';
import { AppError, MSG } from '../lib/errors';
import { env } from '../lib/env';
import { isRecord } from '../lib/http';
import { LINE_USER_ID } from '../lib/line';

export const webhookRoutes = new Hono<AppEnv>();

function isCallbackRequest(v: unknown): v is webhook.CallbackRequest {
  return isRecord(v) && Array.isArray(v.events);
}

/** LINE Messaging API webhook (§10.6): authenticated by x-line-signature, not by the edge header. */
webhookRoutes.post('/line', async (c) => {
  const secret = env.lineMessagingSecret();
  if (!secret) throw new AppError(501, 'line_not_configured', MSG.lineMessagingNotConfigured);

  // The HMAC covers the exact bytes LINE sent, so verify before any parsing.
  const raw = Buffer.from(await c.req.arrayBuffer());
  const signature = c.req.header('x-line-signature') ?? '';
  if (!signature || !validateSignature(raw, secret, signature)) {
    throw new AppError(401, 'invalid_signature', 'ลายเซ็นของคำขอไม่ถูกต้อง');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError(400, 'invalid_json', MSG.invalidJson);
  }
  if (!isCallbackRequest(payload)) throw new AppError(400, 'invalid_request', MSG.invalidRequest);

  const store = getApiStore();
  for (const event of payload.events) {
    if (event.type !== 'follow' && event.type !== 'unfollow') continue;
    const source = event.source;
    if (source?.type !== 'user' || !source.userId || !LINE_USER_ID.test(source.userId)) continue;
    await store.setOaFriend(source.userId, event.type === 'follow');
  }
  // LINE's "Verify" button sends an empty events array; it only needs a 200.
  return c.json({ ok: true });
});
