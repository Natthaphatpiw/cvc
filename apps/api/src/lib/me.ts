import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthUser } from '@cvc/auth';
import { getApiStore } from '@cvc/db';
import type { MeResponse } from '@cvc/schemas';
import type { AppEnv } from '../types';
import { AppError, MSG } from './errors';
import { env } from './env';
import { isRecord, str } from './http';
import { LINE_USER_ID } from './line';

/**
 * Claims of the bearer token. Only call after `requireUser()` has verified the signature: the payload is
 * decoded, not re-verified. Returns null in local demo mode (no token).
 */
export function verifiedClaims(c: Context<AppEnv>): Record<string, unknown> | null {
  const token = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return isRecord(json) ? json : null;
  } catch {
    return null;
  }
}

export type LineProfile = { displayName: string | null; pictureUrl: string | null };

/**
 * LINE profile from `user_metadata`: the `custom:line` OIDC provider stores the ID token claims
 * (name / picture, sometimes full_name / avatar_url); Fallback B users get name / picture from /auth/line/exchange.
 */
export function lineProfileFromClaims(claims: Record<string, unknown> | null): LineProfile {
  const meta = claims && isRecord(claims.user_metadata) ? claims.user_metadata : {};
  return {
    displayName: str(meta.name) ?? str(meta.full_name) ?? str(meta.display_name),
    pictureUrl: str(meta.picture) ?? str(meta.avatar_url),
  };
}

export function requireLineSub(user: AuthUser): string {
  if (!user.lineSub || user.isAnonymous) throw new AppError(403, 'line_login_required', MSG.lineRequired);
  if (!LINE_USER_ID.test(user.lineSub)) throw new AppError(403, 'line_profile_invalid', MSG.lineRequired);
  return user.lineSub;
}

/** Guests have no app.users row; they acknowledge the privacy notice before POST /auth/guest. */
export function guestMe(user: AuthUser): MeResponse {
  return {
    userId: user.id,
    isAnonymous: true,
    displayName: null,
    pictureUrl: null,
    role: user.role,
    isOaFriend: false,
    pushOptIn: false,
    needsNoticeAck: false,
  };
}

/** LINE user that has not been bootstrapped yet (or the store lost the row). */
export function unsyncedLineMe(user: AuthUser, profile: LineProfile): MeResponse {
  return {
    userId: user.id,
    isAnonymous: false,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    role: user.role,
    isOaFriend: false,
    pushOptIn: false,
    needsNoticeAck: env.noticeVersion() !== '',
  };
}

/** Upserts app.users from the verified token (idempotent). Returns the stored profile. */
export async function syncLineUser(c: Context<AppEnv>): Promise<MeResponse> {
  const user = c.get('user');
  const lineSub = requireLineSub(user);
  const profile = lineProfileFromClaims(verifiedClaims(c));
  const store = getApiStore();
  await store.upsertLineUser({ userId: user.id, lineSub, ...profile });
  ensured.add(user.id);
  return (await store.getUser(user.id)) ?? unsyncedLineMe(user, profile);
}

// Users already upserted by this instance; ensureAppUser skips the write for them.
const ensured = new Set<string>();

export function forgetEnsuredUser(userId: string): void {
  ensured.delete(userId);
}

/**
 * §10.3 `ensureAppUser`: every route that writes app.* for a LINE user first makes sure app.users has the row,
 * so a client that skipped /me/bootstrap never hits a foreign-key failure. Mount after requireUser({ requireLine: true }).
 */
export const ensureAppUser = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get('user').id;
  if (!ensured.has(userId)) {
    requireLineSub(c.get('user'));
    // Existing rows are left alone (bootstrap owns profile refresh); only a missing row is created.
    if (await getApiStore().getUser(userId)) ensured.add(userId);
    else await syncLineUser(c);
  }
  await next();
});
