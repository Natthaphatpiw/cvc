// Minimal copies of @cvc/thai helpers: @cvc/scoring only depends on @cvc/schemas.

const THAI_CHAR = /\p{Script=Thai}/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;

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

export function normalizeHandle(h: string): string {
  const trimmed = h.trim();
  const fromUrl = /tiktok\.com\/@([^/?#\s]+)/i.exec(trimmed);
  const raw = fromUrl?.[1] ?? trimmed;
  return raw.replace(/^@+/, '').trim().toLowerCase();
}

/** Lowercase, NFC, collapse whitespace — for brand-name matching. */
export function normalizeName(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export const THAI_WEEKDAYS: readonly string[] = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

/** Mon=0 … Sun=6 and hour 0..23 in Asia/Bangkok (fixed UTC+7, no DST). */
export function bangkokDayHour(d: Date): { weekday: number; hour: number } {
  const b = new Date(d.getTime() + 7 * 3_600_000);
  return { weekday: (b.getUTCDay() + 6) % 7, hour: b.getUTCHours() };
}
