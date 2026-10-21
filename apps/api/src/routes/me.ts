import { Hono } from 'hono';
import { requireEdge, requireUser } from '@cvc/auth';
import { getApiStore } from '@cvc/db';
import { ConsentRequest, type MeResponse } from '@cvc/schemas';
import type { AppEnv } from '../types';
import { postToAgent } from '../lib/agent';
import { AppError, MSG, invalidRequest } from '../lib/errors';
import { isSupabaseAdminConfigured } from '../lib/env';
import { readJson } from '../lib/http';
import {
  ensureAppUser,
  forgetEnsuredUser,
  guestMe,
  lineProfileFromClaims,
  syncLineUser,
  unsyncedLineMe,
  verifiedClaims,
} from '../lib/me';
import { getAdminClient } from '../lib/supabase';

export const meRoutes = new Hono<AppEnv>();

meRoutes.use('*', requireEdge());

// needsNoticeAck for LINE users comes from ApiStore.getUser, which compares the user's privacy_notice_ack consents
// with NEXT_PUBLIC_NOTICE_VERSION (the ApiStore contract exposes no separate consent reader).

/** First call after every LINE login (§10.3): upsert app.users from the verified JWT + LINE profile. */
meRoutes.post('/bootstrap', requireUser({ allowAnonymous: true }), async (c) => {
  const user = c.get('user');
  if (user.isAnonymous || !user.lineSub) return c.json<MeResponse>(guestMe(user));
  return c.json<MeResponse>(await syncLineUser(c));
});

meRoutes.get('/', requireUser({ allowAnonymous: true }), async (c) => {
  const user = c.get('user');
  if (user.isAnonymous || !user.lineSub) return c.json<MeResponse>(guestMe(user));
  const me = await getApiStore().getUser(user.id);
  return c.json<MeResponse>(me ?? unsyncedLineMe(user, lineProfileFromClaims(verifiedClaims(c))));
});

meRoutes.post('/consents', requireUser({ requireLine: true }), ensureAppUser, async (c) => {
  const parsed = ConsentRequest.safeParse(await readJson(c));
  if (!parsed.success) throw invalidRequest(parsed.error.issues);
  const user = c.get('user');
  const store = getApiStore();
  await store.recordConsent(user.id, parsed.data);
  const me = await store.getUser(user.id);
  if (!me) throw new AppError(404, 'user_not_found', MSG.notFound);
  return c.json<MeResponse>(me);
});

meRoutes.get('/export', requireUser({ requireLine: true }), () => {
  throw new AppError(501, 'not_implemented', 'การส่งออกข้อมูลส่วนบุคคลจะเปิดให้ใช้ในระยะที่ 2');
});

/**
 * PDPA account deletion (§11.1). Order matters: the agent purge runs first (chat threads and other data the
 * database cascade cannot reach) so a failure leaves the account intact and the user can retry. Deleting the auth
 * user then cascades app.users (consents, saved results, shares, notifications) and analysis.runs.
 */
meRoutes.delete('/', requireUser({ allowAnonymous: true }), async (c) => {
  const user = c.get('user');

  // Any non-2xx, 404 included, keeps the account: deleting it after a skipped purge would orphan the chat threads.
  const res = await postToAgent('/api/agent/internal/purge-user', { userId: user.id }, 60_000);
  if (!res.ok) {
    console.error('[api] purge-user returned', res.status);
    throw new AppError(502, 'purge_failed', 'ลบข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }

  // Explicit app-data removal through the store (also covers the in-memory store, which has no FK cascade).
  const store = getApiStore();
  if (!user.isAnonymous && user.lineSub) {
    const saved = await store.listSaved(user.id);
    for (const s of saved) await store.deleteSaved(user.id, s.id);
  }
  forgetEnsuredUser(user.id);

  if (!user.local) {
    if (!isSupabaseAdminConfigured()) throw new AppError(501, 'supabase_not_configured', MSG.supabaseNotConfigured);
    const { error } = await getAdminClient().auth.admin.deleteUser(user.id);
    if (error && error.status !== 404) {
      console.error('[api] admin.deleteUser failed', error.code, error.message);
      throw new AppError(502, 'purge_failed', 'ลบบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  }
  return c.body(null, 204);
});
