import { Hono } from 'hono';
import { requireOidc } from '@cvc/auth';
import { getApiStore } from '@cvc/db';
import type { AppEnv } from '../types';
import { invalidRequest } from '../lib/errors';
import { env, isLineMessagingConfigured, isSupabaseAdminConfigured } from '../lib/env';
import { isRecord, readJson, str } from '../lib/http';
import { LINE_USER_ID, pushLineText, retryKeyFor } from '../lib/line';
import { getAdminClient } from '../lib/supabase';

/** Service-to-service endpoints; only cvc-agent may call them (Vercel OIDC). */
export const internalRoutes = new Hono<AppEnv>();

type NotifyRequest = { userId: string; resultId: string; brandName: string; runId: string | null; lineSub: string | null };

type NotifyResponse = {
  status: 'sent' | 'skipped';
  reason: 'line_not_configured' | 'user_not_found' | 'no_opt_in' | 'not_friend' | 'no_line_id' | 'quota' | 'duplicate' | null;
};

function parseNotify(body: unknown): NotifyRequest | null {
  if (!isRecord(body)) return null;
  const userId = str(body.userId);
  const resultId = str(body.resultId);
  if (!userId || !resultId || !/^[A-Za-z0-9_-]{1,64}$/.test(resultId)) return null;
  const brandName = (str(body.brandName) ?? str(body.brand) ?? '').trim().slice(0, 120);
  return { userId, resultId, brandName, runId: str(body.runId), lineSub: str(body.lineSub) };
}

/** LINE sub of a user: from the agent's payload when given, otherwise from Supabase app_metadata / identities. */
async function lookupLineSub(userId: string): Promise<string | null> {
  if (!isSupabaseAdminConfigured()) return null;
  const { data, error } = await getAdminClient().auth.admin.getUserById(userId);
  if (error) return null;
  const fromMeta = str(data.user.app_metadata.line_sub);
  if (fromMeta && LINE_USER_ID.test(fromMeta)) return fromMeta;
  const identity = data.user.identities?.find((i) => i.provider.includes('line'));
  const fromIdentity = str(identity?.identity_data?.sub) ?? str(identity?.id);
  return fromIdentity && LINE_USER_ID.test(fromIdentity) ? fromIdentity : null;
}

/**
 * Run-finished notification (§10.6). Plain text only (no emoji, no Flex in the MVP). Pushed only when the user
 * opted in and is a friend of the OA; push quota exhaustion is reported as skipped (the result is still in-app).
 */
internalRoutes.post('/notify', requireOidc('agent'), async (c) => {
  const req = parseNotify(await readJson(c));
  if (!req) throw invalidRequest([{ path: ['userId'], message: 'userId and resultId are required' }]);
  const skip = (reason: NotifyResponse['reason']) => c.json<NotifyResponse>({ status: 'skipped', reason });

  if (!isLineMessagingConfigured()) return skip('line_not_configured');
  const me = await getApiStore().getUser(req.userId);
  if (!me) return skip('user_not_found');
  if (!me.pushOptIn) return skip('no_opt_in');
  if (!me.isOaFriend) return skip('not_friend');

  const to = req.lineSub && LINE_USER_ID.test(req.lineSub) ? req.lineSub : await lookupLineSub(req.userId);
  if (!to) return skip('no_line_id');

  const url = `${env.appUrl()}/results/${encodeURIComponent(req.resultId)}`;
  const brand = req.brandName || 'แบรนด์ของคุณ';
  const text = `ผลวิเคราะห์ของ ${brand} พร้อมแล้ว ดูได้ที่ ${url}`;
  const outcome = await pushLineText(to, text, await retryKeyFor(`notify:${req.runId ?? req.resultId}`));
  if (outcome === 'quota') return skip('quota');
  return c.json<NotifyResponse>({ status: 'sent', reason: outcome === 'duplicate' ? 'duplicate' : null });
});
