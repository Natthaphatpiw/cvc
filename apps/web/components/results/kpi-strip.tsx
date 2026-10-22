'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, MousePointerClick, Scale, Users, Wallet, type LucideIcon } from 'lucide-react';
import type { FinalResult } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { formatCompact, formatNumber, formatTHB, formatTHBRange } from '@/lib/format';
import { AssumptionBadge, ConfidenceBadge } from './estimate-badges';
import { BUDGET_FIT_LABEL, BUDGET_FIT_TONE, lowestConfidence, TIER_LABEL, usesAssumption } from './labels';
import { formatCompactRange } from './numbers';
import { cn } from '@/lib/cn';

/** One line; when it does not fit, it is cut with an ellipsis and the full text shows in a tooltip (and on focus). */
function Caption({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <Tooltip content={text} disabled={!cut} repeatsLabel className="mt-1 flex min-w-0">
      <span
        ref={ref}
        tabIndex={cut ? 0 : undefined}
        className="block min-w-0 truncate rounded-chip text-meta font-light text-muted tabular-nums"
      >
        {text}
      </span>
    </Tooltip>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  caption,
  extra,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  caption?: string;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-card border border-border bg-surface p-4 shadow-card sm:p-5', className)}>
      <span className="flex items-center gap-2.5">
        <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <span className="min-w-0 text-label font-light text-muted">{label}</span>
      </span>
      <span className="mt-3 text-kpi font-normal text-text tabular-nums">{value}</span>
      {caption ? <Caption text={caption} /> : null}
      {extra ? <span className="mt-2 flex flex-wrap gap-1.5">{extra}</span> : null}
    </div>
  );
}

/** One short line for the KPI cell; the full explanation (plan.budgetFitTh) is in the plan panel. */
function budgetFitShort(result: FinalResult): string {
  const { plan } = result;
  const budget = result.brief.budgetTHB;
  const mid = (plan.totals.feeTHB.min + plan.totals.feeTHB.max) / 2;
  if (!budget || plan.budgetFit === 'no_budget') return 'ยังไม่ได้ระบุงบประมาณ';
  const hi = Math.max(budget.min, budget.max);
  const lo = Math.min(budget.min, budget.max);
  switch (plan.budgetFit) {
    case 'over':
      return `ค่ากลางเกินงบสูงสุด ${formatTHB(mid - hi)}`;
    case 'under':
      return `ค่าจ้างสูงสุดใช้งบเพียง ${formatNumber((plan.totals.feeTHB.max / lo) * 100)}% ของงบขั้นต่ำ`;
    case 'within':
      return plan.totals.feeTHB.max > hi ? 'ค่ากลางอยู่ในงบ แต่ช่วงบนเกินงบ' : 'ทั้งช่วงอยู่ในงบ';
  }
}

// Columns follow the room in <main> (a size container), not the viewport, so a collapsed sidebar widens them.
const GRID = 'grid grid-cols-1 gap-3 @min-[560px]/main:grid-cols-2 sm:gap-4';

/** KPI cards (UI_CONTRACT §6 Cards): one accent-soft icon tile each, the figure, one caption line. */
export function KpiStrip({ result }: { result: FinalResult }) {
  const { plan } = result;
  const picks = result.recommendations.filter(
    (r) => plan.selectedCreatorIds.length === 0 || plan.selectedCreatorIds.includes(r.creatorId),
  );
  const confidence = lowestConfidence(picks.map((r) => r.expectedKpis.confidence));
  const assumption = picks.some((r) => usesAssumption(r.expectedKpis));
  const conversion = plan.totals.clicks !== null && plan.totals.orders !== null;
  const creatorCount = plan.selectedCreatorIds.length || result.recommendations.length;
  const tiers = result.brief.recommendedTiers.map((t) => TIER_LABEL[t]).join(' · ');

  return (
    <div
      role="group"
      aria-label="ตัวเลขสรุป"
      className={cn(GRID, conversion ? '@min-[1040px]/main:grid-cols-5' : '@min-[880px]/main:grid-cols-4')}
    >
      <Cell
        icon={Eye}
        label="ยอดวิวคาดการณ์รวมต่อโพสต์"
        value={formatCompact(plan.totals.views.p50)}
        caption={`ช่วงคาดการณ์ ${formatCompactRange(plan.totals.views)} วิว`}
        extra={
          confidence || assumption ? (
            <>
              {confidence ? <ConfidenceBadge confidence={confidence} /> : null}
              {assumption ? <AssumptionBadge /> : null}
            </>
          ) : null
        }
      />
      {conversion && plan.totals.clicks && plan.totals.orders ? (
        <Cell
          icon={MousePointerClick}
          label="คลิกและคำสั่งซื้อคาดการณ์"
          value={`${formatCompact(plan.totals.clicks.p50)} คลิก`}
          caption={`คำสั่งซื้อ ${formatNumber(plan.totals.orders.p50)} (ช่วง ${formatNumber(plan.totals.orders.p25)}–${formatNumber(plan.totals.orders.p75)})`}
          extra={assumption ? <AssumptionBadge /> : null}
        />
      ) : null}
      <Cell
        icon={Wallet}
        label="ค่าจ้างรวมโดยประมาณ (ค่ากลาง)"
        value={formatTHB((plan.totals.feeTHB.min + plan.totals.feeTHB.max) / 2)}
        caption={`ช่วง ${formatTHBRange(plan.totals.feeTHB)}`}
      />
      <Cell
        icon={Scale}
        label="ความเหมาะกับงบ"
        value={<Badge tone={BUDGET_FIT_TONE[plan.budgetFit]}>{BUDGET_FIT_LABEL[plan.budgetFit]}</Badge>}
        caption={
          result.brief.budgetTHB ? `${budgetFitShort(result)} · งบ ${formatTHBRange(result.brief.budgetTHB)}` : budgetFitShort(result)
        }
      />
      <Cell
        icon={Users}
        label="ครีเอเตอร์ที่แนะนำ"
        value={`${formatNumber(creatorCount)} คน`}
        caption={tiers ? `เน้นระดับ ${tiers}` : undefined}
        className={conversion ? '@min-[560px]/main:col-span-2 @min-[1040px]/main:col-span-1' : undefined}
      />
    </div>
  );
}

export function KpiStripSkeleton() {
  return (
    <div aria-hidden="true" className={cn(GRID, '@min-[880px]/main:grid-cols-4')}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col rounded-card border border-border bg-surface p-4 shadow-card sm:p-5">
          <span className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-control" />
            <Skeleton className="h-4 w-32" />
          </span>
          <Skeleton className="mt-3 h-8 w-24" />
          <Skeleton className="mt-1 h-4 w-40" />
        </div>
      ))}
    </div>
  );
}
