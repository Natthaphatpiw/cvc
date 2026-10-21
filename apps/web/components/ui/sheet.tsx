'use client';

import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFocusTrap } from './use-focus-trap';
import { useMounted } from './use-mounted';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  /** Header content (text or e.g. avatar + handle). When omitted, pass `ariaLabel` and render your own header. */
  title?: ReactNode;
  /** Accessible name when `title` is not plain text. */
  ariaLabel?: string;
  children: ReactNode;
  /** Desktop width in px (default 560) or 'full' for a full-screen sheet at every size. Phones are always full screen. */
  width?: number | 'full';
  /** Content under the header that should not scroll (e.g. tabs). */
  subheader?: ReactNode;
  className?: string;
};

/** Right-side dialog sheet: focus trap, Escape and backdrop close, focus returns to the opener. */
export function Sheet({ open, onClose, title, ariaLabel, children, width = 560, subheader, className }: SheetProps) {
  const mounted = useMounted();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(panelRef, open, onClose);

  if (!mounted || !open) return null;

  const full = width === 'full';
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        style={full ? undefined : { maxWidth: `${width}px` }}
        className={cn(
          'absolute inset-y-0 right-0 flex w-full animate-sheet-in flex-col bg-surface shadow-float outline-none',
          full ? 'max-w-none' : 'sm:border-l sm:border-border',
          className,
        )}
      >
        <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-rule px-4 py-2 sm:px-5">
          <div id={titleId} className="min-w-0 flex-1 text-section font-medium text-text">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-raised hover:text-text sm:size-8"
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </div>
        {subheader ? <div className="shrink-0">{subheader}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
