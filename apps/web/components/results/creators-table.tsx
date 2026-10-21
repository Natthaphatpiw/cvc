'use client';

import type { Recommendation } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber, formatPct, formatTHBRange } from '@/lib/format';
import { bulletScaleMax, ExpectedViewsBullet } from './expected-views-bullet';
import { FitStrip } from './fit-strip';
import { TIER_LABEL } from './labels';
import { formatBaht2 } from './numbers';
import { cn } from '@/lib/cn';

export type RankDeltas = ReadonlyMap<string, number>;

function RankCell({ rec, baseRanks }: { rec: Recommendation; baseRanks?: RankDeltas | null }) {
  if (!baseRanks) return <span>{rec.rank}</span>;
  const before = baseRanks.get(rec.creatorId);
  if (before === undefined) {
    return (
      <span className="flex flex-col leading-tight">
        <span>{rec.rank}</span>
        <span className="text-meta text-accent-ink">ใหม่</span>
      </span>
    );
  }
  const delta = before - rec.rank;
  if (delta === 0) return <span>{rec.rank}</span>;
  return (
    <span className="flex flex-col leading-tight">
      <span>{rec.rank}</span>
      <span
        className={cn('text-meta', delta > 0 ? 'text-positive' : 'text-negative')}
        aria-label={delta > 0 ? `ขึ้น ${delta} อันดับ` : `ลง ${Math.abs(delta)} อันดับ`}
      >
        {delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`}
      </span>
    </span>
  );
}

function CreatorName({ rec, withMeta = false }: { rec: Recommendation; withMeta?: boolean }) {
  // the table folds tier and followers into this cell to stay narrow enough to sit beside the rail
  const meta = withMeta
    ? [rec.displayName, rec.tier ? TIER_LABEL[rec.tier] : null, rec.followers !== null ? `${formatCompact(rec.followers)} ผู้ติดตาม` : null]
        .filter((p): p is string => Boolean(p))
        .join(' · ')
    : rec.displayName;
  return (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate text-body font-normal text-text">@{rec.handle.replace(/^@/, '')}</span>
      {meta ? <span className="truncate text-label font-light text-muted">{meta}</span> : null}
    </span>
  );
}

const TH = 'h-9 px-3 text-meta font-normal text-muted whitespace-nowrap';

/** Ranked creators: a table from 768px up, a stacked list below. Rows open the creator sheet. */
export function CreatorsTable({
  items,
  onOpen,
  selectedId,
  baseRanks,
  caption,
}: {
  items: readonly Recommendation[];
  onOpen: (creatorId: string) => void;
  selectedId?: string | null;
  baseRanks?: RankDeltas | null;
  caption: string;
}) {
  const scaleMax = bulletScaleMax(
    items.map((r) => ({ views: r.expectedKpis.perPost.views, tierMedianViews: r.benchmarks.tierMedianViews })),
  );

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      {/* tablet and desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse text-body font-light">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-raised">
              <th scope="col" className={cn(TH, 'w-14 text-right')}>อันดับ</th>
              <th scope="col" className={cn(TH, 'min-w-[220px] text-left')}>ครีเอเตอร์</th>
              <th scope="col" className={cn(TH, 'text-left')}>ยอดวิวคาดการณ์ต่อโพสต์</th>
              <th scope="col" className={cn(TH, 'text-right')}>ER</th>
              <th scope="col" className={cn(TH, 'text-right')}>ค่าตัว / CPV</th>
              <th scope="col" className={cn(TH, 'text-right')}>คะแนน</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {items.map((rec) => {
              const selected = rec.creatorId === selectedId;
              return (
                <tr
                  key={rec.creatorId}
                  onClick={() => onOpen(rec.creatorId)}
                  className={cn(
                    'h-14 cursor-pointer border-t border-rule transition-colors duration-150',
                    selected ? 'bg-accent-soft' : 'hover:bg-raised',
                  )}
                >
                  <td className="w-14 px-3 text-right font-normal">
                    <RankCell rec={rec} baseRanks={baseRanks} />
                  </td>
                  <td className="max-w-[240px] px-3 py-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(rec.creatorId);
                      }}
                      aria-label={`ดูรายละเอียด @${rec.handle.replace(/^@/, '')}`}
                      className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-control text-left"
                    >
                      <CreatorAvatar src={rec.avatarUrl} handle={rec.handle} size={32} alt="" />
                      <CreatorName rec={rec} withMeta />
                      {rec.addedVia === 'chat' ? <Badge tone="accent">เพิ่มจากแชท</Badge> : null}
                    </button>
                  </td>
                  <td className="px-3 py-1">
                    <ExpectedViewsBullet
                      views={rec.expectedKpis.perPost.views}
                      tierMedianViews={rec.benchmarks.tierMedianViews}
                      scaleMax={scaleMax}
                      trackWidth={110}
                    />
                  </td>
                  <td className="px-3 text-right">{formatPct(rec.erViews)}</td>
                  <td className="px-3 text-right whitespace-nowrap">
                    <span className="flex flex-col leading-tight">
                      <span>{formatTHBRange(rec.estFeeTHB)}</span>
                      <span className="text-meta text-muted">CPV {formatBaht2(rec.estCPV)}</span>
                    </span>
                  </td>
                  <td className="px-3">
                    <span className="flex w-fit flex-col items-end gap-1">
                      <span className="text-section leading-none font-normal text-text">{formatNumber(rec.scores.total)}</span>
                      <FitStrip scores={rec.scores} median={rec.benchmarks.poolMedianScores} barWidth={24} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* phone */}
      <ul className="divide-y divide-rule md:hidden" aria-label={caption}>
        {items.map((rec) => {
          const selected = rec.creatorId === selectedId;
          return (
            <li key={rec.creatorId}>
              <button
                type="button"
                onClick={() => onOpen(rec.creatorId)}
                className={cn(
                  'flex w-full cursor-pointer flex-col gap-3 px-4 py-3 text-left transition-colors duration-150',
                  selected ? 'bg-accent-soft' : 'hover:bg-raised',
                )}
              >
                <span className="flex w-full items-center gap-3">
                  <span className="w-6 shrink-0 text-right text-body font-normal tabular-nums text-text">
                    <RankCell rec={rec} baseRanks={baseRanks} />
                  </span>
                  <CreatorAvatar src={rec.avatarUrl} handle={rec.handle} size={40} alt="" />
                  <span className="min-w-0 flex-1">
                    <CreatorName rec={rec} />
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="text-section font-normal tabular-nums text-text">{formatNumber(rec.scores.total)}</span>
                    <span className="text-meta font-light text-muted">คะแนน</span>
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-9 text-label font-light text-muted tabular-nums">
                  {rec.tier ? <Badge tone="neutral">{TIER_LABEL[rec.tier]}</Badge> : null}
                  {rec.addedVia === 'chat' ? <Badge tone="accent">เพิ่มจากแชท</Badge> : null}
                  <span>{formatCompact(rec.followers)} ผู้ติดตาม</span>
                  <span>ER {formatPct(rec.erViews)}</span>
                  <span>{formatTHBRange(rec.estFeeTHB)}</span>
                  <span>CPV {formatBaht2(rec.estCPV)}</span>
                </span>
                <span className="flex flex-col gap-2 pl-9">
                  <ExpectedViewsBullet
                    views={rec.expectedKpis.perPost.views}
                    tierMedianViews={rec.benchmarks.tierMedianViews}
                    scaleMax={scaleMax}
                  />
                  <FitStrip scores={rec.scores} median={rec.benchmarks.poolMedianScores} interactive={false} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CreatorsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="h-9 bg-raised" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-3 border-t border-rule px-3">
          <Skeleton className="h-4 w-5" />
          <Skeleton className="h-8 w-8 rounded-full!" />
          <div className="flex w-40 flex-col gap-1">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="hidden h-2 w-40 md:block" />
          <Skeleton className="ml-auto hidden h-1.5 w-[216px] md:block" />
          <Skeleton className="h-5 w-8" />
        </div>
      ))}
    </div>
  );
}
