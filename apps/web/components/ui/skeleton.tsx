import { cn } from '@/lib/cn';

/**
 * Placeholder block at the real size of the content it stands for; pulses at 1.2s (off under reduced motion).
 * 8px corners by default; pass rounded-full / rounded-chip / rounded-control / rounded-card to match the real shape
 * (those classes sort after rounded-[8px] in the generated CSS, so they win).
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block animate-pulse-soft rounded-[8px] bg-raised', className)} />; // taste-skill-ignore: loading state (UI_CONTRACT §6)
}
