import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type CardProps = ComponentProps<'div'> & { className?: string; children: ReactNode };

/** White surface, 1px border, radius 16, padding 20 (16 on phone), soft resting elevation (shadow-card). */
export function Card({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('rounded-card border border-border bg-surface p-4 shadow-card sm:p-5', className)} {...props}>
      {children}
    </div>
  );
}

export type SectionHeadingProps = {
  title: ReactNode;
  action?: ReactNode;
  /** id for aria-labelledby on the section it heads. */
  id?: string;
  /** Heading level; defaults to h2. */
  as?: 'h2' | 'h3';
  className?: string;
};

/** Section heading that sits outside its card, 8px above it. */
export function SectionHeading({ title, action, id, as: Tag = 'h2', className }: SectionHeadingProps) {
  return (
    <div className={cn('mb-2 flex min-h-8 items-end justify-between gap-3', className)}>
      <Tag id={id} className="text-section font-medium text-text">
        {title}
      </Tag>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
