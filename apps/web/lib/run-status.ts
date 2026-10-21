import { TERMINAL_STATUSES, type RunStatus } from '@cvc/schemas';

export type StatusTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'negative';

const LABELS: Record<RunStatus, string> = {
  queued: 'รอคิว',
  normalizing: 'กำลังวิเคราะห์',
  prefetching: 'กำลังวิเคราะห์',
  researching_brand: 'กำลังวิเคราะห์',
  awaiting_review: 'รอตรวจข้อมูลแบรนด์',
  discovering: 'กำลังวิเคราะห์',
  evaluating: 'กำลังวิเคราะห์',
  ranking: 'กำลังวิเคราะห์',
  curating: 'กำลังวิเคราะห์',
  completed: 'เสร็จแล้ว',
  partial: 'ได้ผลบางส่วน',
  failed: 'ไม่สำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
};

const TONES: Record<RunStatus, StatusTone> = {
  queued: 'neutral',
  normalizing: 'accent',
  prefetching: 'accent',
  researching_brand: 'accent',
  awaiting_review: 'warning',
  discovering: 'accent',
  evaluating: 'accent',
  ranking: 'accent',
  curating: 'accent',
  completed: 'positive',
  partial: 'warning',
  failed: 'negative',
  cancelled: 'neutral',
};

export function runStatusLabel(s: RunStatus): string {
  return LABELS[s];
}

export function runStatusTone(s: RunStatus): StatusTone {
  return TONES[s];
}

export function isTerminalStatus(s: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}

/** A finished run that has something to show on /results. */
export function hasResult(s: RunStatus): boolean {
  return s === 'completed' || s === 'partial';
}
