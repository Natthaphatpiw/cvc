import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'info' | 'positive' | 'warning' | 'negative';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  info: 'bg-info-soft text-info-ink',
  positive: 'bg-positive-soft text-positive',
  warning: 'bg-warning-soft text-warning',
  negative: 'bg-negative-soft text-negative',
};

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-subtle',
  accent: 'bg-accent',
  info: 'bg-info',
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
};

export type BadgeProps = {
  tone?: BadgeTone;
  /** 6px status dot before the label. */
  dot?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
};

/** Text-only status/label pill: 12/400, 2×10 padding, soft fill with the tone's ink (every pair passes 4.5:1). */
export function Badge({ tone = 'neutral', dot = false, className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-0.5 text-meta font-normal',
        tones[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', dots[tone])} /> : null}
      {children}
    </span>
  );
}
