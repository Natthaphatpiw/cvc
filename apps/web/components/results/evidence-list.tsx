import type { ResultEvidence } from '@cvc/schemas';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDateTh } from '@/lib/format';
import { SOURCE_TYPE_LABEL } from './labels';

export function evidenceAnchorId(ref: string): string {
  return `evidence-${ref.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Sources the brand analysis and the creator reasons cite ([E1] …). */
export function EvidenceList({ items }: { items: readonly ResultEvidence[] }) {
  return (
    <ol className="divide-y divide-rule overflow-hidden rounded-card border border-border bg-surface">
      {items.map((ev) => (
        <li key={ev.ref} id={evidenceAnchorId(ev.ref)} className="flex scroll-mt-24 items-start gap-3 px-4 py-3">
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
  );
}
