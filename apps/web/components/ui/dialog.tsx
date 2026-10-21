'use client';

import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useFocusTrap } from './use-focus-trap';
import { useMounted } from './use-mounted';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, right-aligned. Put the safe choice first. */
  actions: ReactNode;
  /** alertdialog for destructive confirmations. */
  role?: 'dialog' | 'alertdialog';
  className?: string;
};

/** Centred modal for confirmations. Focus trap, Escape closes, focus returns to the opener. */
export function Dialog({ open, onClose, title, description, children, actions, role = 'dialog', className }: DialogProps) {
  const mounted = useMounted();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref, open, onClose);

  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-overlay" onClick={onClose} />
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-[440px] animate-fade-in rounded-card border border-border bg-surface p-5 shadow-float outline-none',
          className,
        )}
      >
        <h2 id={titleId} className="text-section font-medium text-text">
          {title}
        </h2>
        {description ? (
          <div id={descId} className="mt-1.5 text-body text-muted">
            {description}
          </div>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>
      </div>
    </div>,
    document.body,
  );
}
