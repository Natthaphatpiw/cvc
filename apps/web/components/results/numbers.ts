import type { KpiRange } from '@cvc/schemas';
import { formatCompact, formatNumber, THAI_WEEKDAYS } from '@/lib/format';

/** THB with two decimals, used for per-view and per-engagement costs (฿0.36). */
export function formatBaht2(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  return `฿${formatNumber(n, 2)}`;
}

export function formatBaht2Range(r: KpiRange | null): string {
  if (!r) return '–';
  return `${formatBaht2(r.p25)}–${formatNumber(r.p75, 2)}`;
}

/** Group scores and pool medians in FinalResult are points out of 100 (SYSTEM_DESIGN §4.7). */
export function formatScore(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  return formatNumber(Math.round(x));
}

export function formatCompactRange(r: KpiRange): string {
  return `${formatCompact(r.p25)}–${formatCompact(r.p75)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** [19, 20, 22] → "19:00–21:00, 22:00–23:00" (each hour covers h:00 to h+1:00; 23 and 0 join across midnight). */
export function formatHourRanges(hours: readonly number[]): string {
  const sorted = [...new Set(hours)].filter((h) => Number.isInteger(h) && h >= 0 && h <= 23).sort((a, b) => a - b);
  const runs: { start: number; end: number }[] = [];
  for (const h of sorted) {
    const last = runs[runs.length - 1];
    if (last && h === last.end) last.end = h + 1;
    else runs.push({ start: h, end: h + 1 });
  }
  const first = runs[0];
  const last = runs[runs.length - 1];
  if (runs.length > 1 && first && last && first.start === 0 && last.end === 24) {
    runs.shift();
    last.end = first.end;
  }
  return runs.map((r) => `${pad2(r.start)}:00–${pad2(r.end % 24)}:00`).join(', ');
}

/** 0 = Monday … 6 = Sunday, per Playbook.postingWindow. */
export function formatWeekdays(days: readonly number[]): string {
  return [...new Set(days)]
    .sort((a, b) => a - b)
    .map((d) => THAI_WEEKDAYS[d])
    .filter((d): d is string => typeof d === 'string')
    .join(', ');
}
