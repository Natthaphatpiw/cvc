import { cn } from '@/lib/cn';

/** Placeholder block at the real size of the content it stands for; pulses at 1.2s (off under reduced motion). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block animate-pulse-soft rounded-chip bg-raised', className)} />; // taste-skill-ignore: loading state (UI_CONTRACT §6)
}
