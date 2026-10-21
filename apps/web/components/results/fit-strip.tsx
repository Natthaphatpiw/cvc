'use client';

import type { GroupWeights } from '@cvc/schemas';
import { Tooltip } from '@/components/ui/tooltip';
import { GROUP_LABEL, GROUP_ORDER } from './labels';
import { formatScore } from './numbers';

const BAR_H = 6;
const GAP = 4;
const TICK_H = 10;

/** 0–100 points → bar fraction */
function fraction(points: number): number {
  if (!Number.isFinite(points)) return 0;
  return Math.min(1, Math.max(0, points / 100));
}

/**
 * Five thin bars (fit, audience, performance, trust, cost): accent fill to the creator's group
 * score and a 1px tick at the pool median. UI_CONTRACT §7.2.
 */
export function FitStrip({
  scores,
  median,
  interactive = true,
  barWidth = 40,
}: {
  scores: GroupWeights;
  median: GroupWeights;
  /** false inside another control (e.g. a list-row button): no tooltip, no tab stop. */
  interactive?: boolean;
  /** 40 by default (UI_CONTRACT §7.2); 28 in dense tables. */
  barWidth?: number;
}) {
  const BAR_W = barWidth;
  const width = GROUP_ORDER.length * BAR_W + (GROUP_ORDER.length - 1) * GAP;
  const summary = GROUP_ORDER.map(
    (g) => `${GROUP_LABEL[g]} ${formatScore(scores[g])} (มัธยฐาน ${formatScore(median[g])})`,
  ).join(', ');

  const content = (
    <div className="min-w-[220px]">
      <table className="w-full text-meta font-light">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="pr-3 text-left font-light">กลุ่มคะแนน</th>
            <th scope="col" className="pr-3 text-right font-light">คะแนน</th>
            <th scope="col" className="text-right font-light">มัธยฐาน</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {GROUP_ORDER.map((g) => (
            <tr key={g}>
              <th scope="row" className="pr-3 text-left font-light">{GROUP_LABEL[g]}</th>
              <td className="pr-3 text-right font-normal">{formatScore(scores[g])}</td>
              <td className="text-right">{formatScore(median[g])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const strip = (
    <span
      role="img"
      tabIndex={interactive ? 0 : undefined}
      aria-label={`คะแนนรายกลุ่ม: ${summary}`}
      className="inline-flex shrink-0 cursor-default items-center rounded-chip"
      style={{ width, height: TICK_H, gap: GAP }}
    >
      {GROUP_ORDER.map((g) => {
        const value = fraction(scores[g]);
        const med = fraction(median[g]);
        return (
          <span key={g} aria-hidden="true" className="relative block" style={{ width: BAR_W, height: TICK_H }}>
            <span
              className="absolute left-0 block overflow-hidden rounded-[1px] bg-accent-track"
              style={{ top: (TICK_H - BAR_H) / 2, width: BAR_W, height: BAR_H }}
            >
              <span className="block h-full bg-accent" style={{ width: value * BAR_W }} />
            </span>
            <span
              className="absolute top-0 block bg-text"
              style={{ left: Math.min(BAR_W - 1, med * BAR_W), width: 1, height: TICK_H }}
            />
          </span>
        );
      })}
    </span>
  );

  return interactive ? <Tooltip content={content}>{strip}</Tooltip> : strip;
}
