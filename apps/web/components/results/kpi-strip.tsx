'use client';

import type { ReactNode } from 'react';
import type { FinalResult } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact, formatNumber, formatTHB, formatTHBRange } from '@/lib/format';
import { AssumptionBadge, ConfidenceBadge } from './estimate-badges';
import { BUDGET_FIT_LABEL, BUDGET_FIT_TONE, lowestConfidence, TIER_LABEL, usesAssumption } from './labels';
import { formatCompactRange } from './numbers';
import { cn } from '@/lib/cn';

function Cell({
  label,
  value,
  caption,
  extra,
  className,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 bg-surface p-4 sm:p-5', className)}>
      <span className="text-label font-light text-muted">{label}</span>
      <span className="text-kpi font-normal text-text tabular-nums">{value}</span>
      {caption ? <span className="text-meta font-light text-muted tabular-nums">{caption}</span> : null}
      {extra ? <span className="mt-1 flex flex-wrap gap-1.5">{extra}</span> : null}
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

/** KPI container: cells split by 1px dividers (UI_CONTRACT §8 /results). */
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
    <section aria-label="ตัวเลขสรุป" className="overflow-hidden rounded-card border border-border">
      <div className={cn('grid gap-px bg-border grid-cols-1 sm:grid-cols-2', conversion ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        <Cell
          label="ยอดวิวคาดการณ์รวมต่อโพสต์"
          value={formatCompact(plan.totals.views.p50)}
          caption={`ช่วงคาดการณ์ ${formatCompactRange(plan.totals.views)} วิว`}
          extra={
            <>
              {confidence ? <ConfidenceBadge confidence={confidence} /> : null}
              {assumption ? <AssumptionBadge /> : null}
            </>
          }
        />
        {conversion && plan.totals.clicks && plan.totals.orders ? (
          <Cell
            label="คลิกและคำสั่งซื้อคาดการณ์"
            value={`${formatCompact(plan.totals.clicks.p50)} คลิก`}
            caption={`คำสั่งซื้อ ${formatNumber(plan.totals.orders.p50)} (ช่วง ${formatNumber(plan.totals.orders.p25)}–${formatNumber(plan.totals.orders.p75)})`}
            extra={assumption ? <AssumptionBadge /> : null}
          />
        ) : null}
        <Cell
          label="ค่าจ้างรวมโดยประมาณ (ค่ากลาง)"
          value={formatTHB((plan.totals.feeTHB.min + plan.totals.feeTHB.max) / 2)}
          caption={`ช่วง ${formatTHBRange(plan.totals.feeTHB)}`}
        />
        <Cell
          label="ความเหมาะกับงบ"
          value={<Badge tone={BUDGET_FIT_TONE[plan.budgetFit]}>{BUDGET_FIT_LABEL[plan.budgetFit]}</Badge>}
          caption={
            result.brief.budgetTHB ? `${budgetFitShort(result)} · งบ ${formatTHBRange(result.brief.budgetTHB)}` : budgetFitShort(result)
          }
        />
        <Cell
          label="ครีเอเตอร์ที่แนะนำ"
          value={`${formatNumber(creatorCount)} คน`}
          caption={tiers ? `เน้นระดับ ${tiers}` : undefined}
          className={conversion ? 'sm:col-span-2 lg:col-span-1' : undefined}
        />
      </div>
    </section>
  );
}

export function KpiStripSkeleton() {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-card border border-border">
      <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 bg-surface p-4 sm:p-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
