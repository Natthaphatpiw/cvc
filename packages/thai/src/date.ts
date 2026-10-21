import { EMPTY } from './format';

export const THAI_MONTHS_SHORT: readonly string[] = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

/** Mon=0 … Sun=6. */
export const THAI_WEEKDAYS: readonly string[] = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];

// Asia/Bangkok is a fixed UTC+7 offset with no DST, so plain arithmetic is exact and ICU-independent.
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const BUDDHIST_ERA_OFFSET = 543;

function toDate(iso: string | Date): Date | null {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wall-clock parts in Asia/Bangkok. weekday: Mon=0 … Sun=6. */
export function bangkokParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const b = new Date(d.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: b.getUTCFullYear(),
    month: b.getUTCMonth(),
    day: b.getUTCDate(),
    hour: b.getUTCHours(),
    minute: b.getUTCMinutes(),
    weekday: (b.getUTCDay() + 6) % 7,
  };
}

/** '21 ต.ค. 2569' (Buddhist era, Asia/Bangkok); withTime → '21 ต.ค. 2569 10:05 น.' */
export function formatDateTh(iso: string | Date, opts?: { withTime?: boolean }): string {
  const d = toDate(iso);
  if (!d) return EMPTY;
  const p = bangkokParts(d);
  const date = `${p.day} ${THAI_MONTHS_SHORT[p.month] ?? ''} ${p.year + BUDDHIST_ERA_OFFSET}`;
  if (!opts?.withTime) return date;
  const hh = String(p.hour).padStart(2, '0');
  const mm = String(p.minute).padStart(2, '0');
  return `${date} ${hh}:${mm} น.`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** '5 นาทีที่แล้ว', 'อีก 3 วัน', 'เมื่อสักครู่'. Older than a year falls back to the absolute date. */
export function formatRelativeTh(iso: string | Date, now: Date = new Date()): string {
  const d = toDate(iso);
  if (!d) return EMPTY;
  const diff = now.getTime() - d.getTime();
  const abs = Math.abs(diff);
  if (abs < MINUTE) return 'เมื่อสักครู่';
  let value: number;
  let unit: string;
  if (abs < HOUR) {
    value = Math.floor(abs / MINUTE);
    unit = 'นาที';
  } else if (abs < DAY) {
    value = Math.floor(abs / HOUR);
    unit = 'ชั่วโมง';
  } else if (abs < 7 * DAY) {
    value = Math.floor(abs / DAY);
    unit = 'วัน';
  } else if (abs < 30 * DAY) {
    value = Math.floor(abs / (7 * DAY));
    unit = 'สัปดาห์';
  } else if (abs < 365 * DAY) {
    value = Math.floor(abs / (30 * DAY));
    unit = 'เดือน';
  } else {
    return formatDateTh(d);
  }
  return diff >= 0 ? `${value} ${unit}ที่แล้ว` : `อีก ${value} ${unit}`;
}
