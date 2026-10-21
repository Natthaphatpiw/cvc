// Text helpers shared by prompts, stubs and the hashed embedding.

const wordSegmenter = new Intl.Segmenter('th', { granularity: 'word' });

/** Word-like segments (Thai-aware), NFC-normalized and lowercased. */
export function segmentWords(text: string): string[] {
  const out: string[] = [];
  for (const s of wordSegmenter.segment(text.normalize('NFC').toLowerCase())) {
    if (s.isWordLike) out.push(s.segment);
  }
  return out;
}

/** Share of Thai-script letters among all letters (0..1). */
export function thaiShare(text: string): number {
  let thai = 0;
  let letters = 0;
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) {
      letters += 1;
      if (/[฀-๿]/.test(ch)) thai += 1;
    }
  }
  return letters === 0 ? 0 : thai / letters;
}

export function normalizeHandle(h: string): string {
  return h.trim().replace(/^@+/, '').toLowerCase();
}

/** Handles are shown to models; keep only TikTok's handle charset so a crafted handle cannot carry instructions. */
export function safeHandle(h: string): string {
  return normalizeHandle(h).replace(/[^a-z0-9._]/g, '').slice(0, 40);
}

export function uniq<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

/** Case-insensitive de-duplication that keeps the first spelling. */
export function uniqText(xs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of xs) {
    const x = raw.trim();
    const key = x.toLowerCase();
    if (!x || seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

export function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

export function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(0, max - 1))}…`;
}

const ASCII = /^[\x20-\x7e]+$/;

/**
 * Keyword hit in already-lowercased text. ASCII keywords need word boundaries ('cat' must not match 'category');
 * Thai has no spaces, so Thai keywords match as substrings.
 */
export function hasKeyword(textLower: string, keyword: string): boolean {
  const k = keyword.trim().toLowerCase().replace(/^#/, '');
  if (k.length < 2) return false;
  if (ASCII.test(k)) {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(textLower);
  }
  return textLower.includes(k);
}

/** Lowercased caption + hashtags of a video, for keyword heuristics. */
export function videoText(v: { caption: string | null; hashtags: string[] }): string {
  return `${v.caption ?? ''} ${v.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`.normalize('NFC').toLowerCase();
}

/** Canonical https URL without hash or utm_* params; null when not an http(s) URL. */
export function canonicalUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  let url: URL;
  try {
    url = new URL(u.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  url.protocol = 'https:';
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || key === 'fbclid' || key === 'igshid') url.searchParams.delete(key);
  }
  const s = url.toString();
  return s.endsWith('/') && url.pathname !== '/' ? s.slice(0, -1) : s.replace(/\/$/, '');
}

/** '@handle' from a TikTok profile URL. */
export function tiktokHandleFromUrl(u: string | null): string | null {
  if (!u) return null;
  const m = /tiktok\.com\/@([A-Za-z0-9._]+)/i.exec(u);
  return m?.[1] ? normalizeHandle(m[1]) : null;
}
