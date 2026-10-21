'use client';

import { Check } from 'lucide-react';
import type { AudiencePersona } from '@cvc/schemas';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/skeleton';

export const MAX_PERSONAS = 10;

export type PersonaPickerProps = {
  /** null while loading */
  personas: AudiencePersona[] | null;
  selected: string[];
  onToggle: (id: string) => void;
};

/** Multi-select persona chips (toggle buttons). */
export function PersonaPicker({ personas, selected, onToggle }: PersonaPickerProps) {
  if (!personas) {
    return (
      <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="กำลังโหลดกลุ่มลูกค้า">
        {['w-28', 'w-24', 'w-36', 'w-20', 'w-28', 'w-32'].map((w, i) => (
          <Skeleton key={i} className={cn('h-11 rounded-chip sm:h-8', w)} />
        ))}
      </div>
    );
  }
  const full = selected.length >= MAX_PERSONAS;
  return (
    <ul className="flex flex-wrap gap-2">
      {personas.map((p) => {
        const on = selected.includes(p.id);
        const disabled = full && !on;
        return (
          <li key={p.id}>
            <button
              type="button"
              aria-pressed={on}
              aria-label={p.labelTh}
              disabled={disabled}
              title={p.descriptionTh ?? undefined}
              onClick={() => onToggle(p.id)}
              className={cn(
                'inline-flex h-11 items-center gap-1.5 rounded-chip border px-2.5 text-label transition-colors duration-150 sm:h-8',
                on
                  ? 'border-accent-line bg-accent-soft font-normal text-accent-ink'
                  : 'border-control bg-surface font-light text-text hover:bg-raised',
                disabled && 'cursor-not-allowed text-subtle hover:bg-surface',
              )}
            >
              {on ? <Check aria-hidden className="size-3.5 text-accent" strokeWidth={2} /> : null}
              {p.labelTh}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
