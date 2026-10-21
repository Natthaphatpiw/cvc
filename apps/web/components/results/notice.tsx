import type { ReactNode } from 'react';
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
