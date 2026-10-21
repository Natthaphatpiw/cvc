export {
  EMPTY,
  formatNumber,
  formatCompact,
  formatTHB,
  formatTHBRange,
  formatPct,
  formatDateTh,
  formatRelativeTh,
  normalizeHandle,
  THAI_WEEKDAYS,
  THAI_MONTHS_SHORT,
} from '@cvc/thai';

/** 75 → '1:15' (minutes:seconds, for recorder timers). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 42 → '42 วิ' · 135 → '2 นาที 15 วิ' · 3720 → '1 ชม. 2 นาที'. */
export function formatDurationTh(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s} วิ`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return m > 0 ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
  return sec > 0 ? `${m} นาที ${sec} วิ` : `${m} นาที`;
}

/** ETA phrase: 'เหลือประมาณ 5 นาที' (rounded up to the minute; under a minute says so). */
export function formatEtaTh(etaSec: number | null | undefined): string | null {
  if (etaSec == null || !Number.isFinite(etaSec) || etaSec <= 0) return null;
  if (etaSec < 60) return 'เหลือไม่ถึง 1 นาที';
  return `เหลือประมาณ ${Math.ceil(etaSec / 60)} นาที`;
}

/** First two letters of a handle or name without '@', for avatar initials. */
export function initialsFor(handleOrName: string): string {
  // demo handles share the 'cvcdemo_' prefix (packages/providers mock), which would make every avatar "CV"
  const clean = handleOrName.replace(/^@+/, '').replace(/^cvcdemo_/i, '').trim();
  const chars = Array.from(clean.replace(/[\s._-]+/g, ''));
  return (chars.slice(0, 2).join('') || '?').toUpperCase();
}

/** 1536000 → '1.5 MB'. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
