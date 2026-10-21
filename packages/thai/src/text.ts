const THAI_CHAR = /\p{Script=Thai}/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;

/** Share of Thai-script letters (incl. combining vowels/tone marks) among all letters, 0..1. 0 for text without letters. */
export function thaiShare(text: string): number {
  let letters = 0;
  let thai = 0;
  for (const ch of text) {
    if (!LETTER_OR_MARK.test(ch)) continue;
    letters += 1;
    if (THAI_CHAR.test(ch)) thai += 1;
  }
  return letters === 0 ? 0 : thai / letters;
}

export function isThaiText(text: string, min = 0.3): boolean {
  return thaiShare(text) >= min;
}

let segmenter: Intl.Segmenter | null = null;
function getSegmenter(): Intl.Segmenter {
  segmenter ??= new Intl.Segmenter('th', { granularity: 'word' });
  return segmenter;
}

/** Word-like segments (Thai dictionary segmentation via ICU), NFC-normalized, original case. */
export function segmentWords(text: string): string[] {
  const out: string[] = [];
  for (const s of getSegmenter().segment(text.normalize('NFC'))) {
    if (s.isWordLike) out.push(s.segment);
  }
  return out;
}

/** Lower-cased segmented words joined by single spaces, for to_tsvector('simple', …). */
export function toFtsText(text: string): string {
  return segmentWords(text)
    .map((w) => w.toLowerCase())
    .join(' ');
}

// Characters with meaning in to_tsquery syntax; stripped so user text can never alter the query structure.
const TSQUERY_SPECIAL = /[&|!():*<>'"\\\s]/g;

/** AND-query for to_tsquery('simple', …): 'คำ1 & คำ2'. Empty string when nothing searchable remains. */
export function toTsQuery(text: string): string {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const w of segmentWords(text)) {
    const t = w.toLowerCase().replace(TSQUERY_SPECIAL, '');
    if (t.length === 0 || seen.has(t)) continue;
    seen.add(t);
    terms.push(t);
  }
  return terms.join(' & ');
}

/** '@Some.Handle ' → 'some.handle'; also accepts a TikTok profile URL. */
export function normalizeHandle(h: string): string {
  const trimmed = h.trim();
  const fromUrl = /tiktok\.com\/@([^/?#\s]+)/i.exec(trimmed);
  const raw = fromUrl?.[1] ?? trimmed;
  return raw.replace(/^@+/, '').trim().toLowerCase();
}
