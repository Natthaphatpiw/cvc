import type { Context } from 'hono';
import { rateLimit } from '@cvc/cache';
import type { AppEnv } from '../types';
import { AppError, MSG } from './errors';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

export async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new AppError(400, 'invalid_json', MSG.invalidJson);
  }
}

/** Client IP as forwarded by the web edge proxy (`x-cvc-client-ip`), set on c.var by requireEdge. */
export function clientIp(c: Context<AppEnv>): string {
  return c.get('clientIp') || c.req.header('x-cvc-client-ip') || 'unknown';
}

export async function enforceRateLimit(c: Context<AppEnv>, key: string, limit: number, windowSec: number): Promise<void> {
  const r = await rateLimit(key, limit, windowSec);
  if (!r.ok) {
    c.header('Retry-After', String(Math.max(1, Math.ceil(r.resetSec))));
    throw new AppError(429, 'rate_limited', MSG.rateLimited);
  }
}
