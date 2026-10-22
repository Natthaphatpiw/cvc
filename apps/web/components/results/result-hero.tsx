import type { ReactNode } from 'react';
import type { FinalResult } from '@cvc/schemas';
import { AiSparkleIcon } from '@/components/ui/ai-sparkle';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { OBJECTIVE_LABEL } from './labels';

/**
 * The hero paragraph: what the analysis learned about the brand. Results made before brand.overviewTh existed (and
 * guest copies, which are never re-parsed) fall back to the one-liner and audience summary, then to headlineTh.
 */
export function heroOverviewTh(result: FinalResult): string {
  const overview = (result.brand.overviewTh ?? '').trim();
  if (overview) return overview;
  const brand = [result.brand.oneLinerTh, result.brand.audienceSummaryTh]
    .map((t) => t.trim())
    .filter(Boolean)
    .join(' ');
  return brand || result.headlineTh;
}

/**
 * Results header shared by the owner and share screens (UI_CONTRACT §8 /results): a bg-hero card with the brand name,
 * the AI-written overview, industry and tone chips, "ระบบวิเคราะห์ให้" / "ระบบเลือกให้" badges for what the agent
 * inferred, the screen's actions and its meta line.
 */
export function ResultHero({ result, actions, meta }: { result: FinalResult; actions?: ReactNode; meta: ReactNode }) {
  const { brand, brief } = result;
  const overview = heroOverviewTh(result);
  // The fallback text is built in code, so the sparkle (AI-written only, UI_CONTRACT) shows for overviewTh alone.
  const aiWritten = (brand.overviewTh ?? '').trim() !== '';
  const objectiveInferred = (brief.objectiveSource ?? 'user') === 'inferred';
  const audienceInferred = (brief.audienceSource ?? 'user') === 'inferred';
  const nCreatorsInferred = (brief.nCreatorsSource ?? 'user') === 'inferred';
  const objectiveReason = objectiveInferred ? (brief.objectiveReasonTh ?? '').trim() : '';
  // The overview often already says why (the demo overview quotes the reason verbatim): no second copy.
  const showReason = objectiveReason !== '' && !overview.includes(objectiveReason);
  const tones = [...new Set(brand.toneKeywords.map((t) => t.trim()).filter(Boolean))].slice(0, 3);
  const hasChips = Boolean(brand.industry) || tones.length > 0 || objectiveInferred || audienceInferred || nCreatorsInferred;

  return (
    <header className="mb-6 rounded-card border border-border bg-hero p-5 shadow-card sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <h1 className="min-w-0 flex-1 basis-60 text-title font-medium text-text [overflow-wrap:anywhere]">{brand.name}</h1>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {overview ? (
        <div className="mt-3 max-w-[70ch]">
          <p className="flex items-center gap-1.5 text-label font-normal text-accent-ink">
            {aiWritten ? <AiSparkleIcon size={16} /> : null}
            สรุปแบรนด์จากการวิเคราะห์
          </p>
          <p className="mt-1 text-body font-light text-text">{overview}</p>
        </div>
      ) : null}

      {hasChips ? (
        <ul aria-label="ข้อมูลแบรนด์โดยย่อ" className="mt-4 flex flex-wrap gap-1.5">
          {brand.industry ? (
            <li>
              <Badge tone="accent">{brand.industry}</Badge>
            </li>
          ) : null}
          {tones.map((t) => (
            <li key={t}>
              <Badge tone="neutral">{t}</Badge>
            </li>
          ))}
          {audienceInferred ? (
            <li>
              <Badge tone="info">กลุ่มลูกค้า: ระบบวิเคราะห์ให้</Badge>
            </li>
          ) : null}
          {objectiveInferred ? (
            <li>
              <Badge tone="info">เป้าหมาย: {OBJECTIVE_LABEL[brief.objective]} · ระบบเลือกให้</Badge>
            </li>
          ) : null}
          {nCreatorsInferred ? (
            <li>
              <Badge tone="info">ครีเอเตอร์ {formatNumber(brief.nCreators)} คน · ระบบแนะนำ</Badge>
            </li>
          ) : null}
        </ul>
      ) : null}
      {showReason ? (
        <p className="mt-2 max-w-[70ch] text-label font-light text-muted">เหตุผลที่ระบบเลือกเป้าหมายนี้: {objectiveReason}</p>
      ) : null}

      <div className="mt-4 border-t border-rule pt-3 text-meta font-light text-muted">{meta}</div>
    </header>
  );
}

/** ResultHero at its real size: title and actions, the label and a four-line paragraph, chips, the meta line. */
export function ResultHeroSkeleton() {
  return (
    <div className="mb-6 rounded-card border border-border bg-hero p-5 shadow-card sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-20 rounded-control sm:h-9" />
          <Skeleton className="h-11 w-20 rounded-control sm:h-9" />
          <Skeleton className="h-11 w-24 rounded-control sm:h-9" />
        </div>
      </div>
      <div className="mt-3 flex max-w-[70ch] flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Skeleton className="h-[22px] w-24 rounded-chip" />
        <Skeleton className="h-[22px] w-16 rounded-chip" />
        <Skeleton className="h-[22px] w-20 rounded-chip" />
      </div>
      <div className="mt-4 border-t border-rule pt-3">
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
    </div>
  );
}
