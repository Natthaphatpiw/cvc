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
import { heroOverviewTh, ResultHeroSkeleton } from './result-hero';

export const CREATOR_PARAM = 'creator';

/**
 * "ภาพรวมชุดครีเอเตอร์" (the headlineTh lead and the KPI cards), then `1fr 384px` once <main> is 1280px wide
 * (stacked below that): creators and added-from-chat, the caller's rail, then alternatives, methodology and
 * evidence. Rows open the creator sheet, deep-linked with ?creator=<creatorId>. The page must sit in a
 * `@container/main` (the shell's and the share page's <main>).
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

  // Very old results without a brand summary show headlineTh in the hero already; do not repeat it here.
  const lead = result.headlineTh && heroOverviewTh(result) !== result.headlineTh ? result.headlineTh : '';

  return (
    <>
      <section aria-labelledby="sec-portfolio">
        <SectionHeading id="sec-portfolio" title="ภาพรวมชุดครีเอเตอร์" />
        {lead ? <p className="mb-3 max-w-[70ch] text-body font-light text-text">{lead}</p> : null}
        <KpiStrip result={result} />
      </section>

      {/* The rail sits beside the creators only once <main> is 1280px wide (its maximum), where the table still
          fits; a collapsed sidebar reaches that on narrower screens. Below it everything stacks creators → rail →
          the rest, so the plan and chat stay next to the shortlist. */}
      <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-8 @min-[1280px]/main:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex min-w-0 flex-col gap-8 @min-[1280px]/main:col-start-1">
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
          className="min-w-0 scroll-mt-6 @min-[1280px]/main:col-start-2 @min-[1280px]/main:row-span-2 @min-[1280px]/main:row-start-1 @min-[1280px]/main:self-start"
        >
          {rail}
        </aside>

        <div className="flex min-w-0 flex-col gap-8 @min-[1280px]/main:col-start-1">
          {result.alternatives.length > 0 ? (
            <section aria-labelledby="sec-alternatives">
              <SectionHeading id="sec-alternatives" title="ตัวเลือกอื่น" />
              <AlternativesList items={result.alternatives} isDemo={result.isDemo} />
            </section>
          ) : null}

          {/* Reference cards, closed by default; their h2 sits inside the card with the toggle. */}
          <section aria-label="วิธีคำนวณ">
            <MethodologyCard methodology={result.methodology} isPreview={isPreview} action={methodologyAction} />
          </section>

          {result.evidence.length > 0 ? (
            <section aria-label="แหล่งข้อมูลที่อ้างอิง">
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

/**
 * Hero, portfolio KPI cards, table rows and rail at their real sizes. It sits in the same `@container/main` as the
 * page, so the rail appears at the same width.
 */
export function ResultPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดผลวิเคราะห์">
      <ResultHeroSkeleton />
      <div className="mb-2 flex min-h-8 items-end">
        <Skeleton className="h-6 w-44" />
      </div>
      <Skeleton className="mb-3 h-4 w-full max-w-[56ch]" />
      <KpiStripSkeleton />
      <div className="mt-8 grid grid-cols-1 gap-6 @min-[1280px]/main:grid-cols-[minmax(0,1fr)_384px]">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <CreatorsTableSkeleton rows={5} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-6 border-b border-rule pb-2">
            <Skeleton className="h-[22px] w-14" />
            <Skeleton className="h-[22px] w-14" />
          </div>
          {/* the plan card: the open consultant summary, then collapsed sections */}
          <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-1.5 border-t border-rule pt-3">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-3.5 w-48" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
