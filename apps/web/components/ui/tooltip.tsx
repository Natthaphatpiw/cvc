'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMounted } from './use-mounted';

export type TooltipProps = {
  content: ReactNode;
  /** A single focusable element (button, link). It gets aria-describedby while the tooltip shows. */
  children: ReactElement<{
    'aria-describedby'?: string;
    onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
    onFocus?: (e: FocusEvent<HTMLElement>) => void;
    onBlur?: (e: FocusEvent<HTMLElement>) => void;
  }>;
  /** 'top' flips below when there is no room; 'right' is for the collapsed sidebar rail. */
  side?: 'top' | 'right';
  /** Never shows; the trigger and its wrapper stay mounted, so toggling this does not move focus. */
  disabled?: boolean;
  /**
   * The content only repeats the trigger's accessible name (an icon-only rail link): skip aria-describedby so
   * screen readers do not hear it twice.
   */
  repeatsLabel?: boolean;
  /** Classes for the wrapper span (default inline-flex), e.g. 'flex w-full' for a full-width row. */
  className?: string;
};

type Pos = { top: number; left: number };

const GAP = 8;
const MARGIN = 8;

/** Hover/focus tooltip rendered in a portal (never clipped by scroll containers). Escape hides it. */
export function Tooltip({ content, children, side = 'top', disabled = false, repeatsLabel = false, className }: TooltipProps) {
  const mounted = useMounted();
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const open = shown && !disabled;

  const show = useCallback(() => setShown(true), []);
  const hide = useCallback(() => setShown(false), []);

  const place = useCallback(() => {
    const anchor = anchorRef.current?.firstElementChild ?? anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    if (side === 'right') {
      const top = Math.min(Math.max(MARGIN, a.top + a.height / 2 - t.height / 2), window.innerHeight - t.height - MARGIN);
      setPos({ top, left: Math.min(a.right + GAP, window.innerWidth - t.width - MARGIN) });
      return;
    }
    const below = a.top - t.height - GAP < MARGIN;
    const top = below ? a.bottom + GAP : a.top - t.height - GAP;
    const left = Math.min(
      Math.max(MARGIN, a.left + a.width / 2 - t.width / 2),
      window.innerWidth - t.width - MARGIN,
    );
    setPos({ top, left });
  }, [side]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, content, side, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShown(false);
    };
    const onScroll = () => setShown(false);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    // The anchor can move without scrolling (the sidebar width transition): re-place once layout settles.
    document.addEventListener('transitionend', place);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('transitionend', place);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  if (!isValidElement(children)) return children;
  const childProps = children.props;
  const trigger = cloneElement(children, {
    'aria-describedby': open && !repeatsLabel ? id : childProps['aria-describedby'],
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e);
      show();
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e);
      hide();
    },
  });

  return (
    <span ref={anchorRef} className={className ?? 'inline-flex'}>
      {trigger}
      {mounted && open
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
              aria-hidden={repeatsLabel || undefined}
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
              className="pointer-events-none fixed z-[60] max-w-[280px] rounded-control border border-border bg-surface px-2.5 py-1.5 text-meta text-text shadow-float"
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
