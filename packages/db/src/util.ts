/** Process-wide singleton that survives Next dev HMR module reloads. */
export function globalSingleton<T>(key: string, init: () => T): T {
  const sym = Symbol.for(key);
  const g = globalThis as unknown as Record<symbol, unknown>;
  if (!(sym in g)) g[sym] = init();
  return g[sym] as T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortDeep(x);
    }
    return out;
  }
  return v;
}

/** JSON with object keys sorted recursively, so equal values always serialize identically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value)) ?? 'null';
}

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export function toIsoOrNull(d: Date | string | null | undefined): string | null {
  return d === null || d === undefined ? null : toIso(d);
}

/** numeric / bigint columns come back from postgres.js as strings. */
export function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: number | null | undefined): number | null {
  return v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v);
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}

/** TikTok handles are stored without '@'. */
export function cleanHandle(h: string): string {
  return h.trim().replace(/^@+/, '');
}

export function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const m = new Map<string, T>();
  for (const it of items) m.set(key(it), it);
  return [...m.values()];
}
