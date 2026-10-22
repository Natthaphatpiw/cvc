import type { ResultEvidence } from '@cvc/schemas';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Disclosure } from '@/components/ui/disclosure';
import { formatDateTh, formatNumber } from '@/lib/format';
import { SOURCE_TYPE_LABEL } from './labels';

export function evidenceAnchorId(ref: string): string {
  return `evidence-${ref.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** "Facebook 3 · เว็บไซต์ 2": what the closed card holds, by source type in the order they first appear. */
function sourceSummary(items: readonly ResultEvidence[]): string {
  const counts = new Map<ResultEvidence['sourceType'], number>();
  for (const ev of items) counts.set(ev.sourceType, (counts.get(ev.sourceType) ?? 0) + 1);
  return [...counts].map(([type, n]) => `${SOURCE_TYPE_LABEL[type]} ${formatNumber(n)}`).join(' · ');
}

/**
 * Sources the brand analysis and the creator reasons cite ([E1] …). Reference material, closed by default; the
 * rows stay in the DOM, so their anchors exist.
 */
export function EvidenceList({ items }: { items: readonly ResultEvidence[] }) {
  return (
    <Disclosure
      variant="card"
      headingLevel="h2"
      title="แหล่งข้อมูลที่อ้างอิง"
      preview={sourceSummary(items)}
      meta={<Badge tone="neutral">{formatNumber(items.length)} แหล่ง</Badge>}
      panelClassName="pb-1!"
    >
      <ol className="divide-y divide-rule border-t border-rule">
        {items.map((ev) => (
          <li key={ev.ref} id={evidenceAnchorId(ev.ref)} className="flex scroll-mt-24 items-start gap-3 py-3">
            <span className="mt-0.5 shrink-0 rounded-chip bg-raised px-1.5 text-meta font-normal text-muted tabular-nums">
              {ev.ref}
            </span>
            <div className="min-w-0 flex-1">
              <a
                href={ev.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-1 rounded-chip text-body font-normal text-text hover:text-accent"
              >
                <span className="truncate">{ev.title || ev.url}</span>
                <ExternalLink aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0 text-muted" />
                <span className="sr-only">(เปิดในแท็บใหม่)</span>
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-meta font-light text-muted">
                <Badge tone="neutral">{SOURCE_TYPE_LABEL[ev.sourceType]}</Badge>
                <span>ดึงข้อมูลเมื่อ {formatDateTh(ev.retrievedAt)}</span>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}
