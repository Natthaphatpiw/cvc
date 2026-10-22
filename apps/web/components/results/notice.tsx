import type { ReactNode } from 'react';
import type { FinalResult } from '@cvc/schemas';
import { Disclosure } from '@/components/ui/disclosure';
import { cn } from '@/lib/cn';

type NoticeTone = 'neutral' | 'accent' | 'warning' | 'negative';

const TONE_CLASS: Record<NoticeTone, string> = {
  neutral: 'border-border bg-raised text-text',
  accent: 'border-accent-line bg-accent-soft text-accent-ink',
  warning: 'border-warning-soft bg-warning-soft text-warning',
  negative: 'border-negative-soft bg-negative-soft text-negative',
};

/** Full-width band for page-level states (partial, preview, offline copy, redactions). */
export function Notice({
  tone = 'neutral',
  title,
  children,
  actions,
  role = 'status',
}: {
  tone?: NoticeTone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  role?: 'status' | 'alert' | 'note';
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col gap-3 rounded-card border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        TONE_CLASS[tone],
      )}
    >
      <div className="min-w-0">
        <p className="text-body font-normal">{title}</p>
        {children ? <div className="mt-0.5 text-label font-light">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** What a partial result is missing (UI_CONTRACT §9): creators without a narrative, no brand sources, caveats. */
export function partialDetailsTh(result: FinalResult): string[] {
  const missing: string[] = [];
  const noNarrative = result.recommendations.filter((r) => r.narrativeStatus !== 'ready').length;
  if (noNarrative > 0) missing.push(`คำอธิบายของครีเอเตอร์ ${noNarrative} คนยังไม่พร้อม`);
  if (result.evidence.length === 0) missing.push('ไม่มีแหล่งข้อมูลของแบรนด์ที่ดึงได้');
  missing.push(...result.methodology.caveatsTh.slice(0, 2));
  return missing;
}

/** The partial-result warning: the warning itself stays visible, the list of what is missing opens below it. */
export function PartialResultNotice({ result }: { result: FinalResult }) {
  const details = partialDetailsTh(result);
  return (
    <Notice tone="warning" title="ผลวิเคราะห์บางส่วน" role="note">
      <p>บางขั้นตอนหรือแหล่งข้อมูลไม่สำเร็จ ตัวเลขบางส่วนอาจขาดหาย</p>
      {details.length > 0 ? (
        <Disclosure variant="inline" title="ดูรายละเอียด" className="mt-1">
          <ul className="list-disc space-y-0.5 pl-5">
            {details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </Notice>
  );
}
