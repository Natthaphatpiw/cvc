import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Shown inline after the title (e.g. a status badge). */
  meta?: ReactNode;
  className?: string;
};

/** Page title 24/500 with an optional one-line description; actions on the right, bottom-aligned with it. */
export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 text-title font-medium text-text [overflow-wrap:anywhere]">{title}</h1>
          {meta}
        </div>
        {description ? <p className="mt-1 text-body text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
