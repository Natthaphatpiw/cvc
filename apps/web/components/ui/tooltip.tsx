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
};

type Pos = { top: number; left: number; placement: 'top' | 'bottom' };

const GAP = 8;
const MARGIN = 8;

/** Hover/focus tooltip rendered in a portal (never clipped by scroll containers). Escape hides it. */
export function Tooltip({ content, children }: TooltipProps) {
  const mounted = useMounted();
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current?.firstElementChild ?? anchorRef.current;
    const tip = tipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const placement: Pos['placement'] = a.top - t.height - GAP < MARGIN ? 'bottom' : 'top';
    const top = placement === 'top' ? a.top - t.height - GAP : a.bottom + GAP;
    const left = Math.min(
      Math.max(MARGIN, a.left + a.width / 2 - t.width / 2),
      window.innerWidth - t.width - MARGIN,
    );
    setPos({ top, left, placement });
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (!isValidElement(children)) return children;
  const childProps = children.props;
  const trigger = cloneElement(children, {
    'aria-describedby': open ? id : childProps['aria-describedby'],
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
    <span ref={anchorRef} className="inline-flex">
      {trigger}
      {mounted && open
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
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
