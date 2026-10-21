'use client';

import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';

export type ErrorBlockProps = {
  messageTh: string;
  onRetry?: () => void;
  /** Label for the retry button (default "ลองอีกครั้ง"). */
  retryLabel?: string;
  /** Extra action, e.g. a link to start over. */
  action?: ReactNode;
  /** Small print under the message (run id for support). */
  detail?: ReactNode;
  className?: string;
};

/** Error shown inside the block that failed: plain Thai cause and a retry. */
export function ErrorBlock({ messageTh, onRetry, retryLabel = 'ลองอีกครั้ง', action, detail, className }: ErrorBlockProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col gap-3 rounded-card border border-negative/25 bg-negative-soft p-4 sm:flex-row sm:items-center', className)}
    >
      <div className="flex min-w-0 flex-1 gap-2.5">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-negative" strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="text-body font-normal text-text">{messageTh}</p>
          {detail ? <p className="mt-0.5 text-meta text-muted">{detail}</p> : null}
        </div>
      </div>
      {onRetry || action ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-6 sm:pl-0">
          {onRetry ? (
            <Button size="sm" onClick={onRetry}>
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
