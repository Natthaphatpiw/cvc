import type { Recommendation } from '@cvc/schemas';
import { AiSparkleIcon } from '@/components/ui/ai-sparkle';
import { cn } from '@/lib/cn';

/**
 * The paragraph on how this creator fits the brand and its target customers. Results made before fitSummaryTh
 * existed (and guest copies that were never re-parsed) fall back to the first two "ทำไมถึงเหมาะ" reasons.
 */
export function creatorFitSummaryTh(rec: Recommendation): string {
  const summary = (rec.fitSummaryTh ?? '').trim();
  if (summary) return summary;
  return rec.whyMatchTh
    .slice(0, 2)
    .map((w) => w.text.trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * AI-written fit summary (UI_CONTRACT §7.5) on an accent-soft panel: in the creators-table row accordion and first in
 * the sheet's ภาพรวม tab. The sparkle only marks text the curator model wrote (narrativeStatus 'ready').
 */
export function CreatorFitSummary({
  rec,
  headingLevel,
  className,
}: {
  rec: Recommendation;
  /** Make the label a heading (the sheet); omitted in the table row, where it is a plain label. */
  headingLevel?: 'h3' | 'h4';
  className?: string;
}) {
  const text = creatorFitSummaryTh(rec);
  const aiWritten = rec.narrativeStatus === 'ready' && text !== '';
  const Label = headingLevel ?? 'p';

  return (
    <div className={cn('rounded-control bg-accent-soft px-4 py-3', className)}>
      <Label className="flex items-center gap-1.5 text-label font-normal text-accent-ink">
        {aiWritten ? <AiSparkleIcon size={14} /> : null}
        สรุปความเหมาะสม
      </Label>
      {text ? (
        <p className="mt-1 max-w-[70ch] text-body font-light text-text">{text}</p>
      ) : (
        <p className="mt-1 text-label font-light text-muted">ยังไม่มีสรุป</p>
      )}
      {text && !aiWritten ? (
        <p className="mt-1 text-meta font-light text-muted">คำอธิบายฉบับเต็มจาก AI ยังไม่พร้อมสำหรับครีเอเตอร์นี้</p>
      ) : null}
    </div>
  );
}
