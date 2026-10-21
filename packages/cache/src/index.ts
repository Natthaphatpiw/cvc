import { Ratelimit } from '@upstash/ratelimit';
import { getRedis, getUpstashClient } from './redis';

export { createMemoryRedis, getRedis, isRedisConfigured, type RedisLike } from './redis';

/** Key names (SYSTEM_DESIGN §8.6). */
export const redisKeys = {
  rlGuest: (clientIp: string) => `rl:guest:${clientIp}`,
  rlRun: (sub: string) => `rl:run:${sub}`,
  rlRunIp: (clientIp: string) => `rl:run:ip:${clientIp}`,
  rlChat: (sub: string) => `rl:chat:${sub}`,
  budgetRun: (runId: string) => `budget:run:${runId}`,
  dedupeRun: (ownerId: string, inputHash: string) => `dedupe:run:${ownerId}:${inputHash}`,
  lockStep: (runId: string, stepKey: string) => `lock:step:${runId}:${stepKey}`,
} as const;

const BUDGET_TTL_SEC = 48 * 3600;

const withPrefix = (prefix: string, key: string): string => (key.startsWith(`${prefix}:`) ? key : `${prefix}:${key}`);

function singleton<T>(key: string, init: () => T): T {
  const sym = Symbol.for(key);
  const g = globalThis as unknown as Record<symbol, unknown>;
  if (!(sym in g)) g[sym] = init();
  return g[sym] as T;
}

export type RateLimitResult = { ok: boolean; remaining: number; resetSec: number };

/**
 * `key` is the full key from §8.6 (e.g. `rl:run:{sub}`); a missing `rl:` prefix is added.
 * Upstash: sliding window via @upstash/ratelimit. Memory: fixed window.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const fullKey = withPrefix('rl', key);
  const window = Math.max(1, Math.round(windowSec));
  const client = getUpstashClient();
  if (client) {
    const cache = singleton<{ client?: unknown; limiters: Map<string, Ratelimit> }>('cvc.cache.ratelimit', () => ({ limiters: new Map() }));
    if (cache.client !== client) {
      cache.limiters.clear();
      cache.client = client;
    }
    const id = `${limit}/${window}`;
    let limiter = cache.limiters.get(id);
    if (!limiter) {
      limiter = new Ratelimit({ redis: client, limiter: Ratelimit.slidingWindow(limit, `${window} s`), prefix: 'rl', analytics: false });
      cache.limiters.set(id, limiter);
    }
    const r = await limiter.limit(fullKey.slice('rl:'.length));
    return { ok: r.success, remaining: Math.max(0, r.remaining), resetSec: Math.max(0, Math.ceil((r.reset - Date.now()) / 1000)) };
  }

  const redis = getRedis();
  const nowSec = Date.now() / 1000;
  const bucket = Math.floor(nowSec / window);
  const bucketKey = `${fullKey}:${bucket}`;
  const n = await redis.incr(bucketKey);
  if (n === 1) await redis.expire(bucketKey, window);
  return { ok: n <= limit, remaining: Math.max(0, limit - n), resetSec: Math.max(0, Math.ceil((bucket + 1) * window - nowSec)) };
}

/**
 * Read-through cache. Values are wrapped so that null/false results are cached too. Redis errors never fail the
 * caller: on a read error fn() runs, on a write error the value is returned uncached.
 */
export async function cacheGetOrSet<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  try {
    const hit = await redis.get<{ v: T }>(key);
    if (hit !== null && typeof hit === 'object' && 'v' in hit) return hit.v;
  } catch {
    // cache unavailable: compute
  }
  const value = await fn();
  if (value !== undefined) {
    try {
      await redis.set(key, { v: value }, { ex: ttlSec });
    } catch {
      // best effort
    }
  }
  return value;
}

/**
 * Runs fn while holding `lock:{key}` (prefix added when missing). Returns null without running fn when another
 * holder has the lock. The lock is released only by its owner, and expires after ttlSec if the holder dies.
 */
export async function withLock<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T | null> {
  const redis = getRedis();
  const lockKey = withPrefix('lock', key);
  const token = crypto.randomUUID();
  const acquired = await redis.set(lockKey, token, { nx: true, ex: Math.max(1, Math.ceil(ttlSec)) });
  if (acquired !== 'OK') return null;
  try {
    return await fn();
  } finally {
    await redis.delIfEquals(lockKey, token).catch(() => false);
  }
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Budget thresholds per run in USD: BUDGET_SOFT_USD (default 4) and BUDGET_HARD_USD (default 6). */
export function budgetLimits(): { softUsd: number; hardUsd: number } {
  return { softUsd: envNumber('BUDGET_SOFT_USD', 4), hardUsd: envNumber('BUDGET_HARD_USD', 6) };
}

export type BudgetState = 'ok' | 'soft' | 'hard';

export const budget = {
  /** Adds spend (call before/after each paid call) and returns the run's running total. */
  async add(runId: string, usd: number): Promise<number> {
    const redis = getRedis();
    const key = redisKeys.budgetRun(runId);
    const total = await redis.incrbyfloat(key, usd);
    await redis.expire(key, BUDGET_TTL_SEC);
    return total;
  },
  async get(runId: string): Promise<number> {
    const v = await getRedis().get<number | string>(redisKeys.budgetRun(runId));
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  },
  async state(runId: string): Promise<BudgetState> {
    const spent = await budget.get(runId);
    const { softUsd, hardUsd } = budgetLimits();
    if (spent >= hardUsd) return 'hard';
    if (spent >= softUsd) return 'soft';
    return 'ok';
  },
};

export const dedupe = {
  /** runId of the owner's in-flight/recent run with the same input hash. */
  async get(ownerId: string, inputHash: string): Promise<string | null> {
    const v = await getRedis().get<unknown>(redisKeys.dedupeRun(ownerId, inputHash));
    return v === null || v === undefined ? null : String(v);
  },
  async set(ownerId: string, inputHash: string, runId: string, ttlSec: number): Promise<void> {
    await getRedis().set(redisKeys.dedupeRun(ownerId, inputHash), runId, { ex: Math.max(1, Math.ceil(ttlSec)) });
  },
  async del(ownerId: string, inputHash: string): Promise<void> {
    await getRedis().del(redisKeys.dedupeRun(ownerId, inputHash));
  },
};
