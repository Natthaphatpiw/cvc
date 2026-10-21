import { Check, Circle, CircleAlert, CircleDashed, Clock, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ProgressEvent, RunStatusResponse, Stage } from '@cvc/schemas';
import { cn } from '@/lib/cn';
import { formatDurationTh } from '@/lib/format';

export type StageState = 'done' | 'active' | 'waiting' | 'pending' | 'failed' | 'skipped';

export type StageRow = {
  stage: Stage;
  label: string;
  state: StageState;
  message: string | null;
  /** a source or sub-step failed but the stage finished */
  warning: string | null;
  durationSec: number | null;
};

const STAGES: { stage: Stage; label: string }[] = [
  { stage: 'normalize', label: 'ทำความเข้าใจข้อมูลที่ส่งมา' },
  { stage: 'prefetch', label: 'ดึงข้อมูลเว็บไซต์ Facebook และ TikTok' },
  { stage: 'brand', label: 'วิเคราะห์แบรนด์' },
  { stage: 'review', label: 'รอตรวจข้อมูลแบรนด์' },
  { stage: 'discover', label: 'ค้นหาครีเอเตอร์ไทยที่เกี่ยวข้อง' },
  { stage: 'evaluate', label: 'ประเมินครีเอเตอร์ทีละคน' },
  { stage: 'rank', label: 'คำนวณคะแนนและจัดอันดับ' },
  { stage: 'curate', label: 'เขียนแผนงานและข้อเสนอ' },
];

const ORDER: Stage[] = ['intake', 'normalize', 'prefetch', 'brand', 'review', 'discover', 'evaluate', 'rank', 'curate', 'done'];

function seconds(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b - a) / 1000 : null;
}

/** Turns the event log and the run status into one row per pipeline stage. */
export function deriveStages(events: ProgressEvent[], run: RunStatusResponse | null): StageRow[] {
  const status = run?.status;
  const finished = status === 'completed' || status === 'partial';
  const lastStage = events.length > 0 ? events[events.length - 1]?.stage : undefined;
  const currentStage: Stage | null = finished ? 'done' : (run?.stage ?? lastStage ?? null);
  const currentIdx = currentStage ? ORDER.indexOf(currentStage) : 0;

  const rows: StageRow[] = [];
  for (const def of STAGES) {
    const evs = events.filter((e) => e.stage === def.stage);
    // The review step only appears when the run actually paused for it.
    if (def.stage === 'review' && evs.length === 0 && currentStage !== 'review') continue;

    const idx = ORDER.indexOf(def.stage);
    const last = evs[evs.length - 1];
    const started = evs.find((e) => e.status === 'started');
    const completed = [...evs].reverse().find((e) => e.status === 'completed');
    const failedEv = [...evs].reverse().find((e) => e.status === 'failed');
    const passed = idx < currentIdx;

    let state: StageState;
    if (last?.status === 'skipped') state = 'skipped';
    else if (last?.status === 'completed' || (passed && last?.status !== 'failed')) state = 'done';
    else if (last?.status === 'failed') state = passed ? 'done' : 'failed';
    else if (last?.status === 'waiting') state = 'waiting';
    else if (last || idx === currentIdx) state = 'active';
    else state = 'pending';

    if (status === 'failed' && (state === 'active' || state === 'waiting')) state = 'failed';
    // Cancelling appends a 'failed' event to the current stage; show it as stopped, not as an error.
    if (status === 'cancelled' && (state === 'active' || state === 'waiting' || state === 'failed')) state = 'skipped';
    if (finished && state !== 'skipped' && state !== 'failed') state = 'done';

    rows.push({
      stage: def.stage,
      label: def.label,
      state,
      message: state === 'pending' ? null : (last?.messageTh ?? null),
      warning: state === 'done' && failedEv ? failedEv.messageTh : null,
      durationSec: started && completed ? seconds(started.at, completed.at) : null,
    });
  }
  return rows;
}

const STATE_TEXT: Record<StageState, string> = {
  done: 'เสร็จแล้ว',
  active: 'กำลังทำ',
  waiting: 'รอการตรวจ',
  pending: 'ยังไม่เริ่ม',
  failed: 'ไม่สำเร็จ',
  skipped: 'ข้าม',
};

function StageIcon({ state, warning }: { state: StageState; warning: boolean }) {
  const cls = 'size-4 shrink-0';
  if (state === 'done' && warning) return <TriangleAlert aria-hidden className={cn(cls, 'text-warning')} strokeWidth={1.75} />;
  if (state === 'done') return <Check aria-hidden className={cn(cls, 'text-accent')} strokeWidth={2} />;
  if (state === 'active') return <LoaderCircle aria-hidden className={cn(cls, 'animate-spin text-accent')} strokeWidth={1.75} />;
  if (state === 'waiting') return <Clock aria-hidden className={cn(cls, 'text-warning')} strokeWidth={1.75} />;
  if (state === 'failed') return <CircleAlert aria-hidden className={cn(cls, 'text-negative')} strokeWidth={1.75} />;
  if (state === 'skipped') return <CircleDashed aria-hidden className={cn(cls, 'text-subtle')} strokeWidth={1.5} />;
  return <Circle aria-hidden className={cn(cls, 'text-control')} strokeWidth={1.5} />;
}

export function StageList({ rows }: { rows: StageRow[] }) {
  return (
    <ol aria-label="ขั้นตอนการวิเคราะห์" className="divide-y divide-rule">
      {rows.map((row) => {
        const right =
          row.state === 'done'
            ? row.durationSec !== null
              ? `เสร็จ · ${formatDurationTh(row.durationSec)}`
              : 'เสร็จ'
            : row.state === 'active'
              ? 'กำลังทำ'
              : row.state === 'failed'
                ? 'ไม่สำเร็จ'
                : row.state === 'skipped'
                  ? 'ข้าม'
                  : row.state === 'waiting'
                    ? 'รอการตรวจ'
                    : '';
        return (
          <li
            key={row.stage}
            aria-current={row.state === 'active' ? 'step' : undefined}
            className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span className="mt-[3px]">
              <StageIcon state={row.state} warning={!!row.warning} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-body',
                  row.state === 'active' ? 'font-normal text-text' : row.state === 'pending' ? 'text-muted' : 'text-text',
                )}
              >
                {row.label}
                <span className="sr-only"> ({STATE_TEXT[row.state]})</span>
              </p>
              {row.message && row.message !== row.label ? (
                <p className="mt-0.5 text-label text-muted">{row.message}</p>
              ) : null}
              {row.warning ? <p className="mt-0.5 text-label text-warning">{row.warning}</p> : null}
            </div>
            {right ? (
              <span
                aria-hidden
                className={cn(
                  'num shrink-0 whitespace-nowrap pt-0.5 text-meta',
                  row.state === 'failed' ? 'text-negative' : row.state === 'active' ? 'text-accent' : 'text-muted',
                )}
              >
                {right}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
