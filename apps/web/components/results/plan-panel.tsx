'use client';

import type { ReactNode } from 'react';
import type { FinalResult } from '@cvc/schemas';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { formatPct, formatTHBRange } from '@/lib/format';
import { NextActionList } from './next-actions';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-body font-medium text-text">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Rail tab "แผนงาน": consultant summary, mix, allocation, timeline, measurement, next actions. */
export function PlanPanel({ result, readOnly = false }: { result: FinalResult; readOnly?: boolean }) {
  const { plan } = result;
  const avatarFor = new Map(
    [...result.recommendations, ...result.addedFromChat].map((r) => [r.creatorId, r.avatarUrl] as const),
  );
  const timeline = [...plan.timeline].sort((a, b) => a.week - b.week);

  return (
    <div className="flex flex-col gap-4 text-body font-light text-text">
      {result.consultantSummaryTh ? (
        <Block title="สรุปจากที่ปรึกษา">
          <p className="whitespace-pre-line">{result.consultantSummaryTh}</p>
        </Block>
      ) : null}

      {plan.mixTh ? (
        <Block title="สัดส่วนครีเอเตอร์">
          <p className="whitespace-pre-line">{plan.mixTh}</p>
        </Block>
      ) : null}

      {plan.budgetAllocation.length > 0 ? (
        <Block title="การจัดสรรงบ">
          <ul className="divide-y divide-rule">
            {plan.budgetAllocation.map((a) => (
              <li key={a.creatorId} className="flex items-center gap-3 py-2">
                <CreatorAvatar src={avatarFor.get(a.creatorId) ?? null} handle={a.handle} size={32} alt="" />
                <span className="min-w-0 flex-1 truncate font-normal">@{a.handle.replace(/^@/, '')}</span>
                <span className="flex shrink-0 flex-col items-end tabular-nums">
                  <span>{formatTHBRange(a.feeTHB)}</span>
                  <span className="text-meta text-muted">
                    {a.shareOfBudget !== null ? `${formatPct(a.shareOfBudget, 0)} ของงบ` : 'ไม่ได้ระบุงบ'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between border-t border-rule pt-2 tabular-nums">
            <span className="text-muted">รวม</span>
            <span className="font-normal">{formatTHBRange(plan.totals.feeTHB)}</span>
          </p>
          {plan.budgetFitTh ? <p className="mt-2 text-label text-muted">{plan.budgetFitTh}</p> : null}
        </Block>
      ) : null}

      {timeline.length > 0 ? (
        <Block title="ไทม์ไลน์">
          <ol className="flex flex-col gap-3">
            {timeline.map((w) => (
              <li key={`${w.week}-${w.titleTh}`} className="grid grid-cols-[72px_1fr] gap-3">
                <span className="text-[13px] leading-[22px] text-muted tabular-nums">สัปดาห์ที่ {w.week}</span>
                <div>
                  <p className="font-normal">{w.titleTh}</p>
                  {w.tasksTh.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-label text-muted">
                      {w.tasksTh.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}

      {plan.measurementPlanTh.length > 0 ? (
        <Block title="การวัดผล">
          <ul className="list-disc space-y-1 pl-4">
            {plan.measurementPlanTh.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block title="ขั้นตอนถัดไป">
        <NextActionList actions={result.nextActions} resultId={result.resultId} readOnly={readOnly} />
      </Block>
    </div>
  );
}
