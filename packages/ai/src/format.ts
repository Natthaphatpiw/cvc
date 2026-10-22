// Small number formatters for Thai stub text and metric placeholders. Kept local so @cvc/ai does not depend on the
// UI formatting package; output matches @cvc/thai (Latin digits, '–' for missing values).
import type { MinMax, Objective } from '@cvc/schemas';

export function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return '–';
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtTHB(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return `฿${fmtNumber(n)}`;
}

export function fmtTHBRange(r: MinMax | null | undefined): string {
  if (!r) return '–';
  if (Math.round(r.min) === Math.round(r.max)) return fmtTHB(r.min);
  return `฿${fmtNumber(r.min)}–${fmtNumber(r.max)}`;
}

export function fmtCpv(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '–';
  return `฿${x.toFixed(2)}`;
}

/** 0..1 group score → 0..100 integer string. */
export function fmtScore(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '–';
  return String(Math.round(x * 100));
}

export const CONFIDENCE_TH: Record<'low' | 'medium' | 'high', string> = { low: 'ต่ำ', medium: 'ปานกลาง', high: 'สูง' };

/** Thai objective labels as the form and results show them; also the glossary in the LLM1 prompt. */
export const OBJECTIVE_LABEL_TH: Record<Objective, string> = {
  awareness: 'รับรู้แบรนด์',
  launch: 'เปิดตัวสินค้า',
  conversion: 'เพิ่มยอดขาย',
  tiktok_shop: 'TikTok Shop',
  brand_building: 'สร้างแบรนด์ระยะยาว',
  ugc: 'คอนเทนต์ UGC',
};
