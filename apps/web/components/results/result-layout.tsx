'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FinalResult } from '@cvc/schemas';
import { ButtonLink } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { AlternativesList } from './alternatives-list';
import { CreatorSheet, type CreatorFeedbackKind } from './creator-sheet';
import { CreatorsTable, CreatorsTableSkeleton, type RankDeltas } from './creators-table';
import { EvidenceList } from './evidence-list';
import { KpiStrip, KpiStripSkeleton } from './kpi-strip';
import { MethodologyCard } from './methodology-card';

export const CREATOR_PARAM = 'creator';

/**
 * KPI strip, then `1fr 384px` from 1600px (stacked below that): creators and added-from-chat, the caller's rail,
 * then alternatives, methodology and evidence. Rows open the
 * creator sheet, deep-linked with ?creator=<creatorId>.
 */
export function ResultLayout({
  result,
  rail,
  readOnly,
  baseRanks,
  isPreview = false,
  methodologyAction,
}: {
  result: FinalResult;
  rail: ReactNode;
  /** Share view and offline copies: no feedback, no checklists. */
  readOnly: boolean;
  baseRanks?: RankDeltas | null;
  isPreview?: boolean;
  methodologyAction?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get(CREATOR_PARAM);
  const [feedback, setFeedback] = useState<Record<string, CreatorFeedbackKind>>({});

  const all = useMemo(() => [...result.recommendations, ...result.addedFromChat], [result]);
  const selected = selectedId ? (all.find((r) => r.creatorId === selectedId) ?? null) : null;

  const withParam = useCallback(
    (creatorId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (creatorId) params.set(CREATOR_PARAM, creatorId);
      else params.delete(CREATOR_PARAM);
      const q = params.toString();
      return q ? `${pathname}?${q}` : pathname;
    },
    [pathname, searchParams],
  );

  const open = useCallback((creatorId: string) => router.push(withParam(creatorId), { scroll: false }), [router, withParam]);
  const close = useCallback(() => router.replace(withParam(null), { scroll: false }), [router, withParam]);

  return (
    <>
      <KpiStrip result={result} />

      {/* The rail sits beside the creators only from 1600px, where the table still fits; narrower screens stack
          creators → rail → the rest, so the plan and chat stay next to the shortlist. */}
      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 min-[1600px]:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex min-w-0 flex-col gap-8 min-[1600px]:col-start-1">
          <section aria-labelledby="sec-creators">
            <SectionHeading id="sec-creators" title={`ครีเอเตอร์ที่แนะนำ (${result.recommendations.length})`} />
            {result.recommendations.length > 0 ? (
              <CreatorsTable
                items={result.recommendations}
                onOpen={open}
                selectedId={selectedId}
                baseRanks={baseRanks}
                caption="ครีเอเตอร์ที่แนะนำ เรียงตามคะแนนรวม"
              />
            ) : (
              <EmptyState
                title="ไม่มีครีเอเตอร์ที่ผ่านเกณฑ์ในการวิเคราะห์นี้"
                action={
                  readOnly ? undefined : (
                    <ButtonLink href="/new" variant="secondary">
                      วิเคราะห์ใหม่ด้วยเงื่อนไขที่กว้างขึ้น
                    </ButtonLink>
                  )
                }
              />
            )}
          </section>

          {result.addedFromChat.length > 0 ? (
            <section aria-labelledby="sec-chat-added">
              <SectionHeading id="sec-chat-added" title="เพิ่มจากแชท" />
              <CreatorsTable
                items={result.addedFromChat}
                onOpen={open}
                selectedId={selectedId}
                caption="ครีเอเตอร์ที่เพิ่มจากแชท"
              />
            </section>
          ) : null}
        </div>

        <aside
          id="result-rail"
          aria-label="แผนงานและถาม-ตอบ"
          className="min-w-0 scroll-mt-6 min-[1600px]:col-start-2 min-[1600px]:row-span-2 min-[1600px]:row-start-1 min-[1600px]:self-start"
        >
          {rail}
        </aside>

        <div className="flex min-w-0 flex-col gap-8 min-[1600px]:col-start-1">
          {result.alternatives.length > 0 ? (
            <section aria-labelledby="sec-alternatives">
              <SectionHeading id="sec-alternatives" title="ตัวเลือกอื่น" />
              <AlternativesList items={result.alternatives} isDemo={result.isDemo} />
            </section>
          ) : null}

          <section aria-labelledby="sec-methodology">
            <SectionHeading id="sec-methodology" title="วิธีคำนวณ" action={methodologyAction} />
            <MethodologyCard methodology={result.methodology} isPreview={isPreview} />
          </section>

          {result.evidence.length > 0 ? (
            <section aria-labelledby="sec-evidence">
              <SectionHeading id="sec-evidence" title="แหล่งข้อมูลที่อ้างอิง" />
              <EvidenceList items={result.evidence} />
            </section>
          ) : null}
        </div>
      </div>

      <CreatorSheet
        rec={selected}
        result={result}
        open={selected !== null}
        onClose={close}
        readOnly={readOnly}
        feedback={selected ? feedback[selected.creatorId] : undefined}
        onFeedback={(creatorId, kind) => setFeedback((f) => ({ ...f, [creatorId]: kind }))}
      />
    </>
  );
}

/** Header, KPI strip, table rows and rail at their real sizes. */
export function ResultPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดผลวิเคราะห์">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-[22px] w-full max-w-md" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <KpiStripSkeleton />
      <div className="mt-6 grid grid-cols-1 gap-6 min-[1600px]:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <CreatorsTableSkeleton rows={5} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-6 border-b border-rule pb-2">
            <Skeleton className="h-[22px] w-14" />
            <Skeleton className="h-[22px] w-14" />
          </div>
          <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-3 h-5 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
