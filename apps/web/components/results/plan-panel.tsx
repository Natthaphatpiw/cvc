'use client';

import type { FinalResult } from '@cvc/schemas';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { Disclosure } from '@/components/ui/disclosure';
import { formatNumber, formatPct, formatTHBRange } from '@/lib/format';
import { previewTh } from './labels';
import { NextActionList } from './next-actions';

/**
 * Rail tab "แผนงาน": consultant summary (open), then mix, allocation, timeline, measurement and next actions, each
 * collapsed behind a one-line preview (UI_CONTRACT §6 progressive disclosure).
 */
export function PlanPanel({ result, readOnly = false }: { result: FinalResult; readOnly?: boolean }) {
  const { plan } = result;
  const avatarFor = new Map(
    [...result.recommendations, ...result.addedFromChat].map((r) => [r.creatorId, r.avatarUrl] as const),
  );
  const timeline = [...plan.timeline].sort((a, b) => a.week - b.week);
  const firstWeek = timeline[0];
  const lastWeek = timeline[timeline.length - 1];
  const soonest = [...result.nextActions].sort((a, b) => a.dueInDays - b.dueInDays)[0];

  return (
    <div className="-my-2 flex flex-col divide-y divide-rule text-body font-light text-text">
      {result.consultantSummaryTh ? (
        <Disclosure title="สรุปจากที่ปรึกษา" preview={previewTh(result.consultantSummaryTh)} defaultOpen>
          <p className="max-w-[70ch] whitespace-pre-line">{result.consultantSummaryTh}</p>
        </Disclosure>
      ) : null}

      {plan.mixTh ? (
        <Disclosure title="สัดส่วนครีเอเตอร์" preview={previewTh(plan.mixTh)}>
          <p className="max-w-[70ch] whitespace-pre-line">{plan.mixTh}</p>
        </Disclosure>
      ) : null}

      {plan.budgetAllocation.length > 0 ? (
        <Disclosure
          title="การจัดสรรงบ"
          preview={`${formatNumber(plan.budgetAllocation.length)} ครีเอเตอร์ · รวม ${formatTHBRange(plan.totals.feeTHB)}`}
        >
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
        </Disclosure>
      ) : null}

      {firstWeek ? (
        <Disclosure
          title="ไทม์ไลน์"
          preview={`${formatNumber(lastWeek?.week ?? firstWeek.week)} สัปดาห์ · เริ่มด้วย ${previewTh(firstWeek.titleTh, 48)}`}
        >
          <ol className="flex flex-col gap-3">
            {timeline.map((w) => (
              <li key={`${w.week}-${w.titleTh}`} className="grid grid-cols-[72px_1fr] gap-3">
                <span className="text-label text-muted tabular-nums">สัปดาห์ที่ {w.week}</span>
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
        </Disclosure>
      ) : null}

      {plan.measurementPlanTh.length > 0 ? (
        <Disclosure
          title="การวัดผล"
          preview={`${formatNumber(plan.measurementPlanTh.length)} ข้อ · ${previewTh(plan.measurementPlanTh[0] ?? '', 48)}`}
        >
          <ul className="list-disc space-y-1 pl-4">
            {plan.measurementPlanTh.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}

      <Disclosure
        title="ขั้นตอนถัดไป"
        preview={
          soonest
            ? `${formatNumber(result.nextActions.length)} รายการ · เริ่มที่ ${previewTh(soonest.titleTh, 48)}`
            : 'ยังไม่มีขั้นตอนถัดไป'
        }
      >
        <NextActionList actions={result.nextActions} resultId={result.resultId} readOnly={readOnly} />
      </Disclosure>
    </div>
  );
}
