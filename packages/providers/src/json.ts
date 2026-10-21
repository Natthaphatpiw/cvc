// Small guards for reading untrusted third-party JSON without `any`.

export type JsonRecord = Record<string, unknown>;

export function asRecord(v: unknown): JsonRecord | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as JsonRecord) : null;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asString(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'bigint') return v.toString();
  return null;
}

/** Accepts numbers and numeric strings ("1234", "1,234"); rejects NaN/Infinity. */
export function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim();
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asBoolean(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return null;
}

/** Reads a nested value: get(obj, 'a', 'b', 0, 'c'). */
export function get(v: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = v;
  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[key];
    } else {
      const rec = asRecord(cur);
      if (!rec) return undefined;
      cur = rec[key];
    }
  }
  return cur;
}

/** First non-null result of `pick` over the candidates. */
export function firstOf<T>(candidates: unknown[], pick: (v: unknown) => T | null): T | null {
  for (const c of candidates) {
    const r = pick(c);
    if (r !== null) return r;
  }
  return null;
}

/** First URL of a TikTok image object ({ url_list: [...] }), a plain string, or null. */
export function imageUrl(v: unknown): string | null {
  if (typeof v === 'string') return asString(v);
  const list = asArray(get(v, 'url_list'));
  for (const u of list) {
    const s = asString(u);
    if (s && /^https?:\/\//.test(s)) return s;
  }
  return null;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const hi = s[mid];
  const lo = s[mid - 1];
  if (hi === undefined) return null;
  if (s.length % 2 === 1 || lo === undefined) return hi;
  return (lo + hi) / 2;
}
