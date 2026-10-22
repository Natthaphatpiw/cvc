import type { KpiRange } from '@cvc/schemas';
import { formatCompact } from '@/lib/format';
import { formatCompactRange } from './numbers';

const TRACK_H = 8;
const TICK_H = 12;

/** Upper end of the shared scale so bullets in one table are comparable. */
export function bulletScaleMax(items: readonly { views: KpiRange; tierMedianViews: number | null }[]): number {
  let max = 0;
  for (const it of items) {
    max = Math.max(max, it.views.p75, it.tierMedianViews ?? 0);
  }
  return max > 0 ? max * 1.1 : 1;
}

/**
 * Expected views per post: accent-line band p25–p75, 2px accent tick at p50, 1px accent-ink tick at the
 * tier median. Label to the right: p50, with the range below. UI_CONTRACT §7.3.
 */
export function ExpectedViewsBullet({
  views,
  tierMedianViews,
  scaleMax,
  showLabel = true,
  trackWidth = 160,
}: {
  views: KpiRange;
  tierMedianViews: number | null;
  /** Shared upper bound; defaults to this row's own range. */
  scaleMax?: number;
  showLabel?: boolean;
  /** 160 by default (UI_CONTRACT §7.3); narrower in dense tables. */
  trackWidth?: number;
}) {
  const TRACK_W = trackWidth;
  const max = scaleMax && scaleMax > 0 ? scaleMax : bulletScaleMax([{ views, tierMedianViews }]);
  const x = (v: number) => Math.min(TRACK_W, Math.max(0, (v / max) * TRACK_W));
  const bandLeft = x(views.p25);
  const bandWidth = Math.max(2, x(views.p75) - bandLeft);
  const tierText = tierMedianViews !== null ? ` ค่ากลางของระดับเดียวกัน ${formatCompact(tierMedianViews)}` : '';
  const label = `ยอดวิวคาดการณ์ต่อโพสต์ ${formatCompact(views.p50)} ช่วง ${formatCompactRange(views)}${tierText}`;

  return (
    <div className="flex items-center gap-3">
      <span role="img" aria-label={label} className="relative block shrink-0" style={{ width: TRACK_W, height: TICK_H }}>
        <span
          aria-hidden="true"
          className="absolute left-0 block rounded-[1px] bg-accent-track"
          style={{ top: (TICK_H - TRACK_H) / 2, width: TRACK_W, height: TRACK_H }}
        />
        <span
          aria-hidden="true"
          className="absolute block bg-accent-line"
          style={{ top: (TICK_H - TRACK_H) / 2, left: bandLeft, width: bandWidth, height: TRACK_H }}
        />
        {tierMedianViews !== null && (
          <span
            aria-hidden="true"
            className="absolute top-0 block bg-accent-ink"
            style={{ left: Math.min(TRACK_W - 1, x(tierMedianViews)), width: 1, height: TICK_H }}
          />
        )}
        <span
          aria-hidden="true"
          className="absolute top-0 block bg-accent"
          style={{ left: Math.min(TRACK_W - 2, Math.max(0, x(views.p50) - 1)), width: 2, height: TICK_H }}
        />
      </span>
      {showLabel && (
        <span aria-hidden="true" className="flex min-w-[64px] flex-col text-right tabular-nums">
          <span className="text-body font-normal text-text">{formatCompact(views.p50)}</span>
          <span className="text-meta font-light text-muted">{formatCompactRange(views)}</span>
        </span>
      )}
    </div>
  );
}
