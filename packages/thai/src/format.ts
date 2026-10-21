/** Placeholder for missing values (en dash). */
export const EMPTY = '–';

const numberFormatters = new Map<number, Intl.NumberFormat>();
function numberFormatter(digits: number): Intl.NumberFormat {
  let f = numberFormatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormatters.set(digits, f);
  }
  return f;
}

function isNum(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** 62000 → '62,000'; null / undefined / NaN → '–'. */
export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (!isNum(n)) return EMPTY;
  const d = Math.max(0, Math.min(20, Math.floor(digits)));
  const out = numberFormatter(d).format(n);
  // Avoid '-0' for tiny negatives that round to zero.
  return /^-0(\.0+)?$/.test(out) ? out.slice(1) : out;
}

const COMPACT_UNITS: readonly { value: number; suffix: string }[] = [
  { value: 1e3, suffix: 'K' },
  { value: 1e6, suffix: 'M' },
  { value: 1e9, suffix: 'B' },
];

function oneDecimal(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** 950 → '950', 62000 → '62K', 1240000 → '1.2M' (Latin suffixes, at most one decimal). */
export function formatCompact(n: number | null | undefined): string {
  if (!isNum(n)) return EMPTY;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (Math.round(abs) < 1000) {
    const r = Math.round(abs);
    return r === 0 ? '0' : sign + String(r);
  }
  let i = abs >= 1e9 ? 2 : abs >= 1e6 ? 1 : 0;
  let unit = COMPACT_UNITS[i] as { value: number; suffix: string };
  // 999,950 would round to '1000K'; promote it to the next unit instead.
  if (Math.round((abs / unit.value) * 10) / 10 >= 1000 && i < COMPACT_UNITS.length - 1) {
    i += 1;
    unit = COMPACT_UNITS[i] as { value: number; suffix: string };
  }
  return sign + oneDecimal(abs / unit.value) + unit.suffix;
}

/** 22500 → '฿22,500'. */
export function formatTHB(n: number | null | undefined): string {
  if (!isNum(n)) return EMPTY;
  const body = formatNumber(Math.abs(n), 0);
  return (n < 0 && body !== '0' ? '-' : '') + '฿' + body;
}

/** { min: 15000, max: 30000 } → '฿15,000–30,000'; equal bounds → '฿15,000'. */
export function formatTHBRange(r: { min: number; max: number } | null): string {
  if (!r || !isNum(r.min) || !isNum(r.max)) return EMPTY;
  const lo = Math.min(r.min, r.max);
  const hi = Math.max(r.min, r.max);
  if (Math.round(lo) === Math.round(hi)) return formatTHB(lo);
  return `${formatTHB(lo)}–${formatNumber(hi, 0)}`;
}

/** 0.071 → '7.1%'. */
export function formatPct(x: number | null | undefined, digits = 1): string {
  if (!isNum(x)) return EMPTY;
  return `${formatNumber(x * 100, digits)}%`;
}
