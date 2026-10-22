'use client';

import { Fragment, useCallback, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Recommendation } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber, formatPct, formatTHBRange } from '@/lib/format';
import { CreatorFitSummary } from './creator-fit-summary';
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

/**
 * Row accordion trigger before the rank (UI_CONTRACT §6 progressive disclosure, rule 4). It stops the click so the
 * row underneath does not open the sheet; focus stays on it while the summary opens below.
 */
function SummaryToggle({
  handle,
  open,
  controls,
  onToggle,
  className,
}: {
  handle: string;
  open: boolean;
  controls: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? 'ซ่อน' : 'แสดง'}สรุป @${handle}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150',
        'hover:bg-accent-soft hover:text-accent-ink',
        open && 'bg-accent-soft text-accent-ink',
        className,
      )}
    >
      <ChevronDown
        aria-hidden="true"
        size={16}
        strokeWidth={1.75}
        className={cn('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')}
      />
    </button>
  );
}

/** The fit summary and a way into the full sheet, shown under an expanded row. */
function SummaryPanel({ rec, onOpen }: { rec: Recommendation; onOpen: (creatorId: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <CreatorFitSummary rec={rec} className="w-full" />
      <Button variant="tertiary" size="sm" onClick={() => onOpen(rec.creatorId)}>
        ดูรายละเอียดทั้งหมด
      </Button>
    </div>
  );
}

const TH = 'h-9 px-3 text-meta font-normal text-muted whitespace-nowrap';
const COLUMNS = 7;

/**
 * Ranked creators: a table from 768px up, a stacked list below. Rows open the creator sheet; the chevron before the
 * rank opens the row's fit summary in place. Open rows are kept by creatorId, so they stay open when a rescore
 * preview re-orders the list, and several can be open at once.
 */
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
  // Both layouts are in the DOM (one hidden by CSS) and the component renders twice on the page, so panel ids are
  // prefixed per instance and per layout.
  const idPrefix = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((creatorId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) next.delete(creatorId);
      else next.add(creatorId);
      return next;
    });
  }, []);

  const scaleMax = bulletScaleMax(
    items.map((r) => ({ views: r.expectedKpis.perPost.views, tierMedianViews: r.benchmarks.tierMedianViews })),
  );

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      {/* tablet and desktop */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] border-collapse text-body font-light">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-raised">
              <th scope="col" className={cn(TH, 'w-10 pl-2 pr-0')}>
                <span className="sr-only">สรุป</span>
              </th>
              <th scope="col" className={cn(TH, 'w-10 pl-1 text-right')}>อันดับ</th>
              <th scope="col" className={cn(TH, 'min-w-[196px] text-left')}>ครีเอเตอร์</th>
              <th scope="col" className={cn(TH, 'text-left')}>ยอดวิวคาดการณ์ต่อโพสต์</th>
              <th scope="col" className={cn(TH, 'text-right')}>ER</th>
              <th scope="col" className={cn(TH, 'text-right')}>ค่าตัว / CPV</th>
              <th scope="col" className={cn(TH, 'text-right')}>คะแนน</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {items.map((rec) => {
              const selected = rec.creatorId === selectedId;
              const open = expanded.has(rec.creatorId);
              const handle = rec.handle.replace(/^@/, '');
              const panelId = `${idPrefix}-table-${rec.creatorId}`;
              return (
                <Fragment key={rec.creatorId}>
                  <tr
                    onClick={() => onOpen(rec.creatorId)}
                    className={cn(
                      'h-14 cursor-pointer border-t border-rule transition-colors duration-150',
                      selected ? 'bg-accent-soft' : 'hover:bg-raised',
                    )}
                  >
                    <td className="w-10 py-2 pl-2 pr-0">
                      <SummaryToggle
                        handle={handle}
                        open={open}
                        controls={panelId}
                        onToggle={() => toggle(rec.creatorId)}
                        className="size-8"
                      />
                    </td>
                    <td className="w-10 pl-1 pr-3 text-right font-normal">
                      <RankCell rec={rec} baseRanks={baseRanks} />
                    </td>
                    <td className="max-w-[220px] px-3 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(rec.creatorId);
                        }}
                        aria-label={`ดูรายละเอียด @${handle}`}
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
                        trackWidth={96}
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
                  {/* No row click here: the panel holds its own button into the sheet. */}
                  <tr id={panelId} hidden={!open} className={selected ? 'bg-accent-soft' : undefined}>
                    <td colSpan={COLUMNS} className="pb-4 pl-[98px] pr-4 pt-0">
                      <SummaryPanel rec={rec} onOpen={onOpen} />
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* phone: the chevron and the open-sheet button are siblings (never a button inside a button) */}
      <ul className="divide-y divide-rule md:hidden" aria-label={caption}>
        {items.map((rec) => {
          const selected = rec.creatorId === selectedId;
          const open = expanded.has(rec.creatorId);
          const handle = rec.handle.replace(/^@/, '');
          const panelId = `${idPrefix}-list-${rec.creatorId}`;
          return (
            <li key={rec.creatorId} className={cn('transition-colors duration-150', selected && 'bg-accent-soft')}>
              <div className="flex items-start gap-1 pl-1.5">
                <SummaryToggle
                  handle={handle}
                  open={open}
                  controls={panelId}
                  onToggle={() => toggle(rec.creatorId)}
                  className="mt-2.5 size-11"
                />
                <button
                  type="button"
                  onClick={() => onOpen(rec.creatorId)}
                  className={cn(
                    'flex min-w-0 flex-1 cursor-pointer flex-col gap-3 rounded-control py-3 pl-1 pr-4 text-left transition-colors duration-150',
                    !selected && 'hover:bg-raised',
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
              </div>
              <div id={panelId} hidden={!open} className="px-4 pb-4">
                <SummaryPanel rec={rec} onOpen={onOpen} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CreatorsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="hidden h-9 bg-raised md:block" />
      {Array.from({ length: rows }, (_, i) => (
        <Fragment key={i}>
          {/* tablet and desktop row: chevron, rank, avatar + name, bullet, ER, fee, score */}
          <div className="hidden h-14 items-center gap-3 border-t border-rule pl-2 pr-3 md:flex">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-5" />
            <Skeleton className="size-8 rounded-full" />
            <div className="flex w-40 flex-col gap-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-2 w-24" />
            <Skeleton className="ml-auto h-4 w-24" />
            <div className="flex flex-col items-end gap-1">
              <Skeleton className="h-4 w-7" />
              <Skeleton className="h-1.5 w-[136px]" />
            </div>
          </div>
          {/* phone row: chevron, rank, avatar + name, score; meta line; bullet */}
          <div className={cn('flex flex-col gap-3 py-3 pl-2.5 pr-4 md:hidden', i > 0 && 'border-t border-rule')}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-8" />
            </div>
            <Skeleton className="ml-[84px] h-3.5 w-48" />
            <Skeleton className="ml-[84px] h-2 w-40" />
          </div>
        </Fragment>
      ))}
    </div>
  );
}
