import { useId } from 'react';
import { cn } from '@/lib/cn';

// Three four-point stars, one large on the left and two small on the right, drawn on a 24px grid.
// Each star is its own path, so the objectBoundingBox gradient runs cyan to blue across every star.
const STARS = [
  'M8.9 5.4C8.9 9.72 11.78 12.6 16.1 12.6C11.78 12.6 8.9 15.48 8.9 19.8C8.9 15.48 6.02 12.6 1.7 12.6C6.02 12.6 8.9 9.72 8.9 5.4Z',
  'M17.6 0.5C17.6 3.38 19.52 5.3 22.4 5.3C19.52 5.3 17.6 7.22 17.6 10.1C17.6 7.22 15.68 5.3 12.8 5.3C15.68 5.3 17.6 3.38 17.6 0.5Z',
  'M17 15.1C17 17.62 18.68 19.3 21.2 19.3C18.68 19.3 17 20.98 17 23.5C17 20.98 15.32 19.3 12.8 19.3C15.32 19.3 17 17.62 17 15.1Z',
];

export type AiSparkleIconProps = {
  /** Width and height in px (default 16). */
  size?: number;
  /**
   * 'gradient' (default): cyan #3dd9ff to blue #1d5bff, on white or light surfaces.
   * 'current': fills with currentColor, e.g. white inside Button variant="ai".
   */
  tone?: 'gradient' | 'current';
  className?: string;
};

/**
 * The AI mark (UI_CONTRACT §2): only on AI-generate actions and next to AI-written summaries, always beside or
 * inside something that already names the action, so it is decorative (aria-hidden).
 */
export function AiSparkleIcon({ size = 16, tone = 'gradient', className }: AiSparkleIconProps) {
  const gradientId = `ai-sparkle-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fill = tone === 'gradient' ? `url(#${gradientId})` : 'currentColor';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      className={cn('shrink-0', className)}
    >
      {tone === 'gradient' ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3dd9ff" />
            <stop offset="0.45" stopColor="#47c2ff" />
            <stop offset="1" stopColor="#1d5bff" />
          </linearGradient>
        </defs>
      ) : null}
      {STARS.map((d) => (
        <path key={d} d={d} fill={fill} />
      ))}
    </svg>
  );
}
