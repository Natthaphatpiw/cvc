import type { Alternative } from '@cvc/schemas';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { formatNumber } from '@/lib/format';

/** Compact rows for creators that scored well but were not picked. */
export function AlternativesList({ items, isDemo }: { items: readonly Alternative[]; isDemo: boolean }) {
  return (
    <ul className="divide-y divide-rule overflow-hidden rounded-card border border-border bg-surface shadow-card">
      {items.map((alt) => {
        const handle = alt.handle.replace(/^@/, '');
        return (
          <li key={alt.creatorId} className="flex items-start gap-3 px-4 py-3">
            <CreatorAvatar src={alt.avatarUrl} handle={alt.handle} size={40} alt="" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {isDemo ? (
                  <>
                    <span className="text-body font-normal text-text">@{handle}</span>
                    <Badge tone="neutral">บัญชีตัวอย่าง</Badge>
                  </>
                ) : (
                  <a
                    href={alt.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-chip text-body font-normal text-text hover:text-accent"
                  >
                    @{handle}
                    <ExternalLink aria-hidden="true" size={14} strokeWidth={1.5} className="text-muted" />
                    <span className="sr-only">(เปิดโปรไฟล์ TikTok ในแท็บใหม่)</span>
                  </a>
                )}
              </div>
              <p className="mt-0.5 text-label font-light text-muted">{alt.reasonTh}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="text-section font-normal tabular-nums text-text">{formatNumber(alt.total)}</span>
              <span className="text-meta font-light text-muted">คะแนน</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
