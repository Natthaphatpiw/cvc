import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { timingSafeEqualStr } from './crypto';
import { isAuthUnavailable, isSupabaseConfigured, verifySupabaseJwt, verifyVercelOidc, type AuthUser } from './jwt';

export type AuthVariables = { user: AuthUser; clientIp: string };
export type AuthEnv = { Variables: AuthVariables };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES_TH = {
  forbidden: 'ไม่มีสิทธิ์เข้าถึง',
  unauthorized: 'กรุณาเข้าสู่ระบบอีกครั้ง',
  lineRequired: 'กรุณาเข้าสู่ระบบด้วย LINE เพื่อใช้งานส่วนนี้',
  unavailable: 'ระบบยืนยันตัวตนขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง',
} as const;

type ErrorStatus = 401 | 403 | 503;

function deny(c: Context, status: ErrorStatus, code: string, messageTh: string): Response {
  return c.json({ error: { code, messageTh } }, status);
}

const isProduction = (): boolean => process.env.NODE_ENV === 'production';

function bearer(header: string | undefined): string | null {
  const m = header ? /^Bearer\s+(\S+)\s*$/i.exec(header) : null;
  return m?.[1] ?? null;
}

/**
 * Shared-secret check for requests forwarded by web's proxy.ts. With EDGE_SHARED_SECRET empty, requests pass only
 * outside production (local dev without the proxy).
 */
function edgeHeaderOk(value: string | undefined): boolean {
  const secret = process.env.EDGE_SHARED_SECRET ?? '';
  if (!secret) return !isProduction();
  return timingSafeEqualStr(value ?? '', secret);
}

/** x-cvc-edge must match EDGE_SHARED_SECRET. Sets c.var.clientIp from x-cvc-client-ip (set by the proxy). */
export function requireEdge(): MiddlewareHandler<AuthEnv> {
  return createMiddleware<AuthEnv>(async (c, next) => {
    if (!edgeHeaderOk(c.req.header('x-cvc-edge'))) return deny(c, 403, 'forbidden', MESSAGES_TH.forbidden);
    const ip = (c.req.header('x-cvc-client-ip') ?? '').trim().slice(0, 64);
    c.set('clientIp', ip || 'unknown');
    await next();
  });
}

/**
 * Bearer Supabase access JWT → c.var.user. Without Supabase (local demo) the caller identifies itself with an
 * x-cvc-guest-id UUID and becomes a local anonymous user. requireLine (or allowAnonymous: false) rejects anonymous
 * users with 403.
 */
export function requireUser(opts: { allowAnonymous?: boolean; requireLine?: boolean } = {}): MiddlewareHandler<AuthEnv> {
  return createMiddleware<AuthEnv>(async (c, next) => {
    let user: AuthUser | null = null;
    if (isSupabaseConfigured()) {
      const token = bearer(c.req.header('authorization'));
      if (token) {
        try {
          user = await verifySupabaseJwt(token);
        } catch (err) {
          if (isAuthUnavailable(err)) return deny(c, 503, 'auth_unavailable', MESSAGES_TH.unavailable);
        }
      }
    } else if (process.env.DEMO_MODE === 'off') {
      return deny(c, 503, 'supabase_not_configured', MESSAGES_TH.unavailable);
    } else {
      const guestId = (c.req.header('x-cvc-guest-id') ?? '').trim().toLowerCase();
      if (UUID_RE.test(guestId)) user = { id: guestId, isAnonymous: true, role: 'member', lineSub: null, local: true };
    }
    if (!user) return deny(c, 401, 'unauthorized', MESSAGES_TH.unauthorized);
    if ((opts.requireLine || opts.allowAnonymous === false) && user.isAnonymous) {
      return deny(c, 403, 'line_login_required', MESSAGES_TH.lineRequired);
    }
    c.set('user', user);
    await next();
  });
}

/** Vercel Cron: Authorization: Bearer CRON_SECRET (unset secret passes only outside production). */
export function requireCron(): MiddlewareHandler<AuthEnv> {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const secret = process.env.CRON_SECRET ?? '';
    const ok = secret ? timingSafeEqualStr(bearer(c.req.header('authorization')) ?? '', secret) : !isProduction();
    if (!ok) return deny(c, 401, 'unauthorized', MESSAGES_TH.unauthorized);
    await next();
  });
}

const PROJECT_ENV = { api: 'VERCEL_PROJECT_API', agent: 'VERCEL_PROJECT_AGENT' } as const;
const PROJECT_DEFAULT = { api: 'cvc-api', agent: 'cvc-agent' } as const;

/**
 * Internal routes: a Vercel OIDC token of the sibling project (same team and environment). Outside production a
 * valid x-cvc-edge header is accepted instead, for local development without Vercel.
 */
export function requireOidc(fromProject: 'api' | 'agent'): MiddlewareHandler<AuthEnv> {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const project = (process.env[PROJECT_ENV[fromProject]] ?? '').trim() || PROJECT_DEFAULT[fromProject];
    const token = bearer(c.req.header('authorization'));
    let ok = false;
    if (token) {
      try {
        await verifyVercelOidc(token, project);
        ok = true;
      } catch {
        ok = false;
      }
    }
    // same rule as requireEdge: an unset secret passes only outside production
    if (!ok && !isProduction()) ok = edgeHeaderOk(c.req.header('x-cvc-edge'));
    if (!ok) return deny(c, 401, 'unauthorized', MESSAGES_TH.unauthorized);
    await next();
  });
}
