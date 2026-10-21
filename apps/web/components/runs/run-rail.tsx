import type { BrandCard, KolPreview } from '@cvc/schemas';
import { formatCompact, formatNumber } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Card, SectionHeading } from '@/components/ui/card';
import { CreatorAvatar } from '@/components/ui/creator-avatar';
import { Skeleton } from '@/components/ui/skeleton';

export type RunRailProps = {
  brand: BrandCard | null;
  candidatesFound: number | null;
  preview: KolPreview[];
  /** the run has ended without these (failed / cancelled): show a plain line instead of skeletons */
  ended: boolean;
};

/** Right rail on the progress page: brand card, candidate count and the first creators found. */
export function RunRail({ brand, candidatesFound, preview, ended }: RunRailProps) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="run-rail-brand">
        <SectionHeading id="run-rail-brand" title="แบรนด์" />
        <Card>
          {brand ? (
            <div>
              <p className="text-section font-medium text-text">{brand.name}</p>
              {brand.industry ? <p className="text-label text-muted">{brand.industry}</p> : null}
              {brand.oneLinerTh ? <p className="mt-2 text-body text-text">{brand.oneLinerTh}</p> : null}
              {brand.toneKeywords.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="บุคลิกของแบรนด์">
                  {brand.toneKeywords.slice(0, 6).map((k) => (
                    <li key={k}>
                      <Badge>{k}</Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : ended ? (
            <p className="text-body text-muted">ยังไม่มีข้อมูลแบรนด์จากการวิเคราะห์นี้</p>
          ) : (
            <div aria-busy="true" aria-label="รอข้อมูลแบรนด์">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-2 h-3.5 w-24" />
              <Skeleton className="mt-3 h-3.5 w-full" />
              <Skeleton className="mt-1.5 h-3.5 w-4/5" />
              <p className="mt-3 text-meta text-muted">ข้อมูลแบรนด์จะแสดงเมื่อวิเคราะห์แบรนด์เสร็จ</p>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="run-rail-creators">
        <SectionHeading id="run-rail-creators" title="ครีเอเตอร์ที่พบ" />
        <Card>
          {candidatesFound !== null ? (
            <p className="text-body text-text" aria-live="polite">
              พบผู้เข้าเกณฑ์ <span className="num text-kpi font-normal">{formatNumber(candidatesFound)}</span> คน
            </p>
          ) : ended ? (
            <p className="text-body text-muted">ยังไม่ได้เริ่มค้นหาครีเอเตอร์</p>
          ) : (
            <p className="text-body text-muted">ยังไม่เริ่มค้นหา จะแสดงเมื่อวิเคราะห์แบรนด์เสร็จ</p>
          )}

          {preview.length > 0 ? (
            <ul className="mt-3 divide-y divide-rule" aria-label="ตัวอย่างครีเอเตอร์ที่พบ">
              {preview.slice(0, 6).map((p) => (
                <li key={p.creatorId} className="flex items-center gap-3 py-2">
                  <CreatorAvatar src={p.avatarUrl} handle={p.handle} size={32} alt="" />
                  <span className="min-w-0 flex-1 truncate text-body font-normal text-text">@{p.handle.replace(/^@/, '')}</span>
                  <span className="num shrink-0 text-label text-muted">
                    {p.followers !== null ? `${formatCompact(p.followers)} ผู้ติดตาม` : '–'}
                  </span>
                </li>
              ))}
            </ul>
          ) : candidatesFound !== null && !ended ? (
            <div className="mt-3 space-y-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
