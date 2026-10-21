import { Redis } from '@upstash/redis';

/** The subset of Redis the app uses; implemented by Upstash and by an in-memory fallback. */
export interface RedisLike {
  readonly kind: 'upstash' | 'memory';
  /** Values are JSON-serialized on write and parsed on read (Upstash automatic deserialization). */
  get<T = unknown>(key: string): Promise<T | null>;
  /** Returns 'OK', or null when nx was set and the key already existed. */
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<'OK' | null>;
  incrbyfloat(key: string, by: number): Promise<number>;
  incr(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<0 | 1>;
  /** Seconds to live; -1 = no expiry, -2 = missing. */
  ttl(key: string): Promise<number>;
  /** Deletes key only while it still holds value (lock release). */
  delIfEquals(key: string, value: string): Promise<boolean>;
}

type Credentials = { url: string; token: string };

function credentials(): Credentials | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();
  return url && token ? { url, token } : null;
}

export function isRedisConfigured(): boolean {
  return credentials() !== null;
}

function singleton<T>(key: string, init: () => T): T {
  const sym = Symbol.for(key);
  const g = globalThis as unknown as Record<symbol, unknown>;
  if (!(sym in g)) g[sym] = init();
  return g[sym] as T;
}

const DEL_IF_EQUALS = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

function createUpstash(client: Redis): RedisLike {
  return {
    kind: 'upstash',
    get: <T>(key: string) => client.get<T>(key),
    async set(key, value, opts) {
      const ex = opts?.ex !== undefined ? Math.max(1, Math.ceil(opts.ex)) : undefined;
      const res =
        ex !== undefined
          ? opts?.nx
            ? await client.set(key, value, { ex, nx: true })
            : await client.set(key, value, { ex })
          : opts?.nx
            ? await client.set(key, value, { nx: true })
            : await client.set(key, value);
      return res === null ? null : 'OK';
    },
    incrbyfloat: (key, by) => client.incrbyfloat(key, by),
    incr: (key) => client.incr(key),
    del: (...keys) => (keys.length ? client.del(...keys) : Promise.resolve(0)),
    expire: (key, seconds) => client.expire(key, Math.max(1, Math.ceil(seconds))),
    ttl: (key) => client.ttl(key),
    async delIfEquals(key, value) {
      // the client stores strings verbatim (only non-strings are JSON-encoded), so compare the raw value
      const n = await client.eval<[string], number>(DEL_IF_EQUALS, [key], [value]);
      return Number(n) === 1;
    },
  };
}

type Entry = { value: string; expiresAt: number | null };

/** Single-process stand-in for local development: TTLs are honoured lazily on access and by a periodic sweep. */
export function createMemoryRedis(now: () => number = Date.now): RedisLike {
  const store = new Map<string, Entry>();
  let lastSweep = now();

  function live(key: string): Entry | undefined {
    const e = store.get(key);
    if (e && e.expiresAt !== null && e.expiresAt <= now()) {
      store.delete(key);
      return undefined;
    }
    return e;
  }

  function sweep(): void {
    const t = now();
    if (t - lastSweep < 60_000) return;
    lastSweep = t;
    for (const [k, e] of store) if (e.expiresAt !== null && e.expiresAt <= t) store.delete(k);
  }

  function parse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  function incrBy(key: string, by: number, integer: boolean): number {
    sweep();
    const e = live(key);
    const current = e ? Number(parse(e.value)) : 0;
    if (!Number.isFinite(current) || (integer && !Number.isInteger(current))) {
      throw new Error(`ERR value at ${key} is not a valid ${integer ? 'integer' : 'float'}`);
    }
    const next = current + by;
    // INCR/INCRBYFLOAT keep the existing TTL
    store.set(key, { value: JSON.stringify(next), expiresAt: e?.expiresAt ?? null });
    return next;
  }

  return {
    kind: 'memory',
    async get<T>(key: string) {
      const e = live(key);
      return e ? (parse(e.value) as T) : null;
    },
    async set(key, value, opts) {
      sweep();
      if (opts?.nx && live(key)) return null;
      const expiresAt = opts?.ex !== undefined ? now() + Math.max(1, Math.ceil(opts.ex)) * 1000 : null;
      store.set(key, { value: JSON.stringify(value) ?? 'null', expiresAt });
      return 'OK';
    },
    async incrbyfloat(key, by) {
      return incrBy(key, by, false);
    },
    async incr(key) {
      return incrBy(key, 1, true);
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) if (live(k) && store.delete(k)) n += 1;
      return n;
    },
    async expire(key, seconds) {
      const e = live(key);
      if (!e) return 0;
      e.expiresAt = now() + Math.max(1, Math.ceil(seconds)) * 1000;
      return 1;
    },
    async ttl(key) {
      const e = live(key);
      if (!e) return -2;
      return e.expiresAt === null ? -1 : Math.ceil((e.expiresAt - now()) / 1000);
    },
    async delIfEquals(key, value) {
      const e = live(key);
      if (!e || parse(e.value) !== value) return false;
      store.delete(key);
      return true;
    },
  };
}

/** Upstash client for the configured credentials (null when not configured). Used by the rate limiter. */
export function getUpstashClient(): Redis | null {
  const creds = credentials();
  if (!creds) return null;
  const cache = singleton<{ key?: string; client?: Redis }>('cvc.cache.upstash', () => ({}));
  const key = `${creds.url}\n${creds.token}`;
  if (cache.key !== key || !cache.client) {
    cache.client = new Redis({ url: creds.url, token: creds.token });
    cache.key = key;
  }
  return cache.client;
}

/** Upstash when configured, otherwise a process-wide in-memory store (kept across Next dev HMR). */
export function getRedis(): RedisLike {
  const client = getUpstashClient();
  if (client) {
    const cache = singleton<{ client?: Redis; redis?: RedisLike }>('cvc.cache.redis', () => ({}));
    if (cache.client !== client || !cache.redis) {
      cache.redis = createUpstash(client);
      cache.client = client;
    }
    return cache.redis;
  }
  return singleton('cvc.cache.memory.v1', () => createMemoryRedis());
}
