import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';

export type AuthRole = 'member' | 'planner' | 'admin';
export type AuthUser = { id: string; isAnonymous: boolean; role: AuthRole; lineSub: string | null; local: boolean };

/** A token that is missing, malformed, expired or fails verification (→ 401). */
export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/**
 * True when verification failed because the key server could not be reached or answered garbage (→ 503),
 * as opposed to a bad token. Keeps an outage from looking like a logout to the client.
 */
export function isAuthUnavailable(err: unknown): boolean {
  if (err instanceof AuthError) return false;
  if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid) return true;
  if (err instanceof errors.JOSEError) return err.code === 'ERR_JOSE_GENERIC';
  return true;
}

type RemoteJwks = ReturnType<typeof createRemoteJWKSet>;

/** One remote key set per URL and process; jose caches keys and refetches on unknown kid. */
function remoteJwks(url: string): RemoteJwks {
  const sym = Symbol.for('cvc.auth.jwks');
  const g = globalThis as unknown as Record<symbol, Map<string, RemoteJwks> | undefined>;
  const cache = (g[sym] ??= new Map());
  let jwks = cache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    cache.set(url, jwks);
  }
  return jwks;
}

function supabaseUrl(): string | null {
  const v = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  return v || null;
}

export function isSupabaseConfigured(): boolean {
  return supabaseUrl() !== null;
}

function record(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Maps verified Supabase access-token claims to AuthUser. */
export function authUserFromClaims(payload: JWTPayload): AuthUser {
  const id = str(payload.sub);
  if (!id) throw new AuthError('invalid_token', 'token has no subject');
  const app = record(payload['app_metadata']);
  const role = app['role'];
  return {
    id,
    isAnonymous: payload['is_anonymous'] === true,
    role: role === 'planner' || role === 'admin' ? role : 'member',
    // only app_metadata (server-controlled); users can edit user_metadata themselves
    lineSub: str(app['line_sub']),
    local: false,
  };
}

/** Verifies a Supabase access JWT against the project's JWKS (asymmetric signing keys). */
export async function verifySupabaseJwt(token: string): Promise<AuthUser> {
  const base = supabaseUrl();
  if (!base) throw new AuthError('supabase_not_configured', 'SUPABASE_URL is not set');
  if (!token) throw new AuthError('missing_token', 'no token');
  const { payload } = await jwtVerify(token, remoteJwks(`${base}/auth/v1/.well-known/jwks.json`), {
    issuer: `${base}/auth/v1`,
    audience: 'authenticated',
    algorithms: ['ES256', 'RS256'],
  });
  return authUserFromClaims(payload);
}

/** Vercel's OIDC key set; @vercel/oidc verifies team-issuer tokens against this same JWKS. */
const VERCEL_OIDC_JWKS = 'https://oidc.vercel.com/.well-known/jwks';

export function vercelEnvironment(): string {
  return (process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || 'development').trim();
}

/**
 * Verifies a Vercel OIDC token issued to a sibling project of the same team and environment
 * (team issuer mode: iss https://oidc.vercel.com/{team}, aud https://vercel.com/{team}).
 */
export async function verifyVercelOidc(token: string, fromProject: string): Promise<{ sub: string }> {
  const team = (process.env.VERCEL_TEAM_SLUG ?? '').trim();
  if (!team) throw new AuthError('oidc_not_configured', 'VERCEL_TEAM_SLUG is not set');
  if (!token) throw new AuthError('missing_token', 'no token');
  const subject = `owner:${team}:project:${fromProject}:environment:${vercelEnvironment()}`;
  const { payload } = await jwtVerify(token, remoteJwks(VERCEL_OIDC_JWKS), {
    issuer: `https://oidc.vercel.com/${team}`,
    audience: `https://vercel.com/${team}`,
    subject,
    algorithms: ['RS256'],
  });
  return { sub: str(payload.sub) ?? subject };
}
