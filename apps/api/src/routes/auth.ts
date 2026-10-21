import { Hono } from 'hono';
import { isAuthApiError, type User } from '@supabase/supabase-js';
import { requireEdge, requireUser, sha256Hex } from '@cvc/auth';
import { getApiStore } from '@cvc/db';
import {
  ClaimRequest,
  ClaimResponse,
  ClaimRunsInternalRequest,
  GuestSessionRequest,
  type SessionTokens,
} from '@cvc/schemas';
import type { AppEnv } from '../types';
import { postToAgent } from '../lib/agent';
import { assertNotBot } from '../lib/botid';
import { AppError, MSG, invalidRequest } from '../lib/errors';
import { isGuestAuthConfigured, isLineLoginConfigured, isSupabaseAdminConfigured } from '../lib/env';
import { clientIp, enforceRateLimit, isRecord, readJson, str } from '../lib/http';
import { verifyLineIdToken, type LineIdentity } from '../lib/line';
import { ensureAppUser } from '../lib/me';
import { createPublicAuthClient, getAdminClient, toSessionTokens } from '../lib/supabase';

export const authRoutes = new Hono<AppEnv>();

const authUpstreamError = () => new AppError(502, 'auth_upstream_error', MSG.upstream);

// ---------------------------------------------------------------------------------------------------------------
// POST /auth/guest — anonymous session for the web guest flow (§10.3).
// Supabase rate-limits anonymous sign-ins per source IP; every call here comes from Vercel's egress, so raise the
// "anonymous sign-ins" limit in Supabase Auth → Rate Limits and rely on rl:guest:{clientIp} for per-user limits.
// ---------------------------------------------------------------------------------------------------------------
authRoutes.post('/guest', requireEdge(), async (c) => {
  if (!isGuestAuthConfigured()) throw new AppError(501, 'supabase_not_configured', MSG.supabaseNotConfigured);
  assertNotBot(c);
  await enforceRateLimit(c, `rl:guest:${clientIp(c)}`, 10, 3600);

  const parsed = GuestSessionRequest.safeParse(await readJson(c));
  if (!parsed.success) throw invalidRequest(parsed.error.issues);

  const { data, error } = await createPublicAuthClient().auth.signInAnonymously({
    options: { data: { notice_version: parsed.data.noticeVersion } },
  });
  if (error) {
    if (error.code === 'anonymous_provider_disabled') {
      throw new AppError(501, 'guest_auth_disabled', 'ยังไม่ได้เปิดการเข้าใช้แบบผู้เยี่ยมชมใน Supabase');
    }
    if (error.code === 'over_request_rate_limit' || error.status === 429) throw new AppError(429, 'rate_limited', MSG.rateLimited);
    console.error('[api] signInAnonymously failed', error.code, error.message);
    throw authUpstreamError();
  }
  if (!data.session) throw authUpstreamError();
  return c.json<SessionTokens>(toSessionTokens(data.session));
});

// ---------------------------------------------------------------------------------------------------------------
// POST /auth/line/exchange — Fallback B from §10.3 (used when Supabase's `custom:line` OIDC provider cannot accept
// the LIFF ID token, spike [SP1]).
//
// 1. The LIFF ID token is verified by LINE itself (POST /oauth2/v2.1/verify, client_id = LINE_LOGIN_CHANNEL_ID).
// 2. The LINE user maps to exactly one Supabase user through a deterministic synthetic email
//    `line_<sub>@users.line.invalid` (RFC 2606 `.invalid`, never deliverable; LINE scopes exclude email).
//    The user is created with the admin API (email_confirm, app_metadata { provider: 'line', line_sub }) on first
//    login; `app_metadata` is writable only with the secret key, so `line_sub` there is trustworthy for @cvc/auth
//    (Supabase may rewrite `provider` to 'email', so `line_sub` is the field to read).
// 3. A session is minted without any email being sent: admin generateLink('magiclink') returns the hashed token,
//    which a non-persistent client redeems with verifyOtp({ token_hash, type: 'email' }). The result is an ordinary
//    Supabase session (access JWT signed by Supabase + refresh token), so every service verifies it via JWKS as usual.
// 4. app.users is upserted (upsertLineUser) and the tokens go back to the browser for supabase.auth.setSession().
// ---------------------------------------------------------------------------------------------------------------
authRoutes.post('/line/exchange', requireEdge(), async (c) => {
  if (!isLineLoginConfigured()) throw new AppError(501, 'line_not_configured', MSG.lineLoginNotConfigured);
  if (!isSupabaseAdminConfigured() || !isGuestAuthConfigured()) {
    throw new AppError(501, 'supabase_not_configured', 'ยังไม่ได้ตั้งค่า Supabase จึงยังเข้าสู่ระบบด้วย LINE ไม่ได้');
  }
  await enforceRateLimit(c, `rl:line-exchange:${clientIp(c)}`, 30, 3600);

  const body = await readJson(c);
  const idToken = isRecord(body) ? str(body.idToken) : null;
  if (!idToken || idToken.length > 4096) throw invalidRequest([{ path: ['idToken'], message: 'required' }]);

  const line = await verifyLineIdToken(idToken);
  const { userId, tokens } = await signInLineUser(line);

  await getApiStore().upsertLineUser({ userId, lineSub: line.sub, displayName: line.name, pictureUrl: line.picture });
  return c.json<SessionTokens>(tokens);
});

function syntheticEmail(lineSub: string): string {
  return `line_${lineSub.toLowerCase()}@users.line.invalid`;
}

async function signInLineUser(line: LineIdentity): Promise<{ userId: string; tokens: SessionTokens }> {
  const admin = getAdminClient().auth.admin;
  const email = syntheticEmail(line.sub);
  const profile = { name: line.name, picture: line.picture, line_sub: line.sub };

  const created = await admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { provider: 'line', line_sub: line.sub },
    user_metadata: profile,
  });
  const isNew = !created.error;
  if (created.error && created.error.code !== 'email_exists' && created.error.status !== 422) {
    console.error('[api] admin.createUser failed', created.error.code, created.error.message);
    throw authUpstreamError();
  }

  // generateLink does not send mail when called with the secret key; it returns the user and the hashed token.
  const link = await admin.generateLink({ type: 'magiclink', email });
  if (link.error) {
    console.error('[api] admin.generateLink failed', link.error.code, link.error.message);
    throw authUpstreamError();
  }
  const user: User = link.data.user;
  if (user.app_metadata.line_sub !== line.sub) {
    // Only this endpoint (secret key) creates these emails, so a mismatch means the row was edited by hand.
    console.error('[api] synthetic LINE user without matching app_metadata.line_sub', user.id);
    throw new AppError(409, 'line_account_conflict', 'บัญชี LINE นี้เชื่อมกับผู้ใช้อื่นอยู่ กรุณาติดต่อผู้ดูแลระบบ');
  }
  if (!isNew && (user.user_metadata.name !== line.name || user.user_metadata.picture !== line.picture)) {
    // Refresh before verifyOtp so the new access token already carries the current LINE profile.
    const updated = await admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, ...profile } });
    if (updated.error) console.warn('[api] updateUserById (profile refresh) failed', updated.error.code);
  }

  // A magic-link token hash is redeemed with type 'email' (the non-deprecated alias of 'magiclink').
  const { data, error } = await createPublicAuthClient().auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'email',
  });
  if (error || !data.session) {
    console.error('[api] verifyOtp failed', error && isAuthApiError(error) ? error.code : error?.message);
    throw authUpstreamError();
  }
  return { userId: user.id, tokens: toSessionTokens(data.session) };
}

// ---------------------------------------------------------------------------------------------------------------
// POST /auth/claim — move guest runs to the LINE user (§10.3). Secrets never leave the api: only sha256 hashes are
// sent to the agent, which matches them against analysis.runs.claim_secret_hash.
// ---------------------------------------------------------------------------------------------------------------
authRoutes.post('/claim', requireEdge(), requireUser({ requireLine: true }), ensureAppUser, async (c) => {
  const parsed = ClaimRequest.safeParse(await readJson(c));
  if (!parsed.success) throw invalidRequest(parsed.error.issues);
  if (parsed.data.items.length === 0) return c.json({ claimed: 0 });

  // parse() pins the payload to the agent's contract (exact keys, uuid user id, 64-hex hashes)
  const body = ClaimRunsInternalRequest.parse({
    userId: c.get('user').id,
    items: await Promise.all(
      parsed.data.items.map(async (i) => ({ runId: i.runId, claimSecretHash: await sha256Hex(i.claimSecret) })),
    ),
  });
  const res = await postToAgent('/api/agent/internal/claim-runs', body);
  if (!res.ok) {
    console.error('[api] claim-runs returned', res.status);
    throw new AppError(502, 'claim_failed', 'ย้ายประวัติการวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  const out = ClaimResponse.safeParse(await res.json().catch(() => null));
  if (!out.success) throw new AppError(502, 'claim_failed', 'ย้ายประวัติการวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  return c.json(out.data);
});
