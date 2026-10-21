import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { SessionTokens } from '@cvc/schemas';
import { AppError, MSG } from './errors';
import { env } from './env';

// Server-side clients never persist or refresh a session: each request gets the tokens and hands them to the browser.
const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

/** Publishable-key client (anonymous sign-in, verifyOtp). A fresh instance per call keeps sessions isolated. */
export function createPublicAuthClient(): SupabaseClient {
  const url = env.supabaseUrl();
  const key = env.supabasePublishableKey();
  if (!url || !key) throw new AppError(501, 'supabase_not_configured', MSG.supabaseNotConfigured);
  return createClient(url, key, { auth: SERVER_AUTH });
}

let adminClient: { key: string; client: SupabaseClient } | null = null;

/** Secret-key client for `auth.admin.*`. Never used for user-scoped calls. */
export function getAdminClient(): SupabaseClient {
  const url = env.supabaseUrl();
  const key = env.supabaseSecretKey();
  if (!url || !key) throw new AppError(501, 'supabase_not_configured', MSG.supabaseNotConfigured);
  const cacheKey = `${url}|${key}`;
  if (adminClient?.key !== cacheKey) adminClient = { key: cacheKey, client: createClient(url, key, { auth: SERVER_AUTH }) };
  return adminClient.client;
}

export function toSessionTokens(s: Session): SessionTokens {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at ?? Math.floor(Date.now() / 1000) + s.expires_in,
  };
}
