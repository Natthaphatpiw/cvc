import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type EmptyStateProps = {
  title: ReactNode;
  /** Optional second line, only when the sentence alone cannot explain the state. */
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** Framed area with one sentence and at most one action. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-control px-4 py-8 text-center',
        className,
      )}
    >
      <p className="text-body font-normal text-text">{title}</p>
      {description ? <p className="-mt-2 max-w-md text-label text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
