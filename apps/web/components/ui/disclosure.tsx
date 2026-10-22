'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type DisclosureVariant = 'section' | 'card' | 'inline';

export type DisclosureProps = {
  /** Visible title; it is the button's accessible name. */
  title: ReactNode;
  /** One line under the title while closed (what is inside); truncated, read as the button's description. */
  preview?: ReactNode;
  /** Small non-interactive content beside the chevron, inside the button (a count, a Badge); read as description. */
  meta?: ReactNode;
  /** Interactive content on the header row, outside the button (never nest buttons in the trigger). */
  action?: ReactNode;
  children: ReactNode;
  /** Uncontrolled initial state (default closed). */
  defaultOpen?: boolean;
  /** Controlled state; pass with onOpenChange. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * 'section' (default): full-width row with a section title, for stacked sections inside a card (add your own
   * dividers). 'card': the same row inside a white card. 'inline': a small accent text toggle such as
   * "ดูรายละเอียด" with the panel below it.
   */
  variant?: DisclosureVariant;
  /** Heading element around the button for 'section' and 'card' (default h3); 'inline' never adds a heading. */
  headingLevel?: 'h2' | 'h3' | 'h4';
  /** id for the panel (otherwise generated), e.g. to link to it. */
  id?: string;
  className?: string;
  /** Classes for the panel, e.g. its padding. */
  panelClassName?: string;
};

/**
 * Progressive disclosure: a button with aria-expanded / aria-controls and a chevron that turns, and a panel that is
 * `hidden` while closed (out of the tab order and the accessibility tree, still in the DOM). Controlled or
 * uncontrolled; no height animation, and the chevron turn is off under reduced motion.
 */
export function Disclosure({
  title,
  preview,
  meta,
  action,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  variant = 'section',
  headingLevel: Heading = 'h3',
  id,
  className,
  panelClassName,
}: DisclosureProps) {
  const autoId = useId();
  const buttonId = `${autoId}-button`;
  const titleId = `${autoId}-title`;
  const previewId = `${autoId}-preview`;
  const metaId = `${autoId}-meta`;
  const panelId = id ?? `${autoId}-panel`;
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;

  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  const chevron = (
    <ChevronDown
      aria-hidden
      className={cn(
        'shrink-0 transition-transform duration-150 motion-reduce:transition-none',
        variant === 'inline' ? 'size-3.5' : 'size-4 text-muted',
        open && 'rotate-180',
      )}
      strokeWidth={1.75}
    />
  );

  if (variant === 'inline') {
    return (
      <div className={className}>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className="-mx-1 inline-flex min-h-11 items-center gap-1 rounded-control px-1 text-label font-normal text-accent transition-colors duration-150 hover:bg-accent-soft hover:text-accent-ink sm:min-h-8"
        >
          {title}
          {chevron}
        </button>
        <div id={panelId} hidden={!open} className={cn('mt-2 animate-fade-in', panelClassName)}>
          {children}
        </div>
      </div>
    );
  }

  const showPreview = preview && !open;
  const describedBy = [showPreview ? previewId : null, meta ? metaId : null].filter(Boolean).join(' ') || undefined;
  const header = (
    <div className={cn('flex items-start gap-2', variant === 'card' && 'px-4 sm:px-5')}>
      <Heading className="min-w-0 flex-1">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-labelledby={titleId}
          aria-describedby={describedBy}
          onClick={toggle}
          className={cn(
            'group/disclosure flex w-full items-center gap-3 rounded-control text-left transition-colors duration-150',
            variant === 'card' ? 'min-h-14 py-3' : 'min-h-12 py-2.5',
          )}
        >
          <span className="min-w-0 flex-1">
            <span id={titleId} className="block text-section font-medium text-text group-hover/disclosure:text-accent-ink">
              {title}
            </span>
            {showPreview ? (
              <span id={previewId} className="mt-0.5 block truncate text-label text-muted">
                {preview}
              </span>
            ) : null}
          </span>
          {meta ? (
            <span id={metaId} className="flex shrink-0 items-center gap-2">
              {meta}
            </span>
          ) : null}
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150 group-hover/disclosure:bg-accent-soft">
            {chevron}
          </span>
        </button>
      </Heading>
      {action ? <div className="flex shrink-0 items-center gap-2 self-center">{action}</div> : null}
    </div>
  );

  const panel = (
    <div
      id={panelId}
      hidden={!open}
      className={cn('animate-fade-in', variant === 'card' ? 'px-4 pb-4 sm:px-5 sm:pb-5' : 'pb-4', panelClassName)}
    >
      {children}
    </div>
  );

  if (variant === 'card') {
    return (
      <div className={cn('rounded-card border border-border bg-surface shadow-card', className)}>
        {header}
        {panel}
      </div>
    );
  }

  return (
    <div className={className}>
      {header}
      {panel}
    </div>
  );
}
