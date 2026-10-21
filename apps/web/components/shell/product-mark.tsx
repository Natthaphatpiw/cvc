import { useId } from 'react';

/** Two overlapping circles (brand and creator: a match), accent stroke, overlap filled accent-soft. */
export function ProductMark({ size = 20 }: { size?: number }) {
  const clipId = `mark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden focusable="false">
      <defs>
        <clipPath id={clipId}>
          <circle cx="7.25" cy="10" r="5.5" />
        </clipPath>
      </defs>
      <circle cx="12.75" cy="10" r="5.5" fill="var(--accent-soft)" clipPath={`url(#${clipId})`} />
      <circle cx="7.25" cy="10" r="5.5" stroke="var(--accent)" strokeWidth="1.75" />
      <circle cx="12.75" cy="10" r="5.5" stroke="var(--accent)" strokeWidth="1.75" />
    </svg>
  );
}
