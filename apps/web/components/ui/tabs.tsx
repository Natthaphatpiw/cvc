'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export type TabItem = { id: string; label: string };

export type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Prefix for tab/panel ids. Panels use tabPanelProps(idPrefix, id). */
  idPrefix?: string;
  ariaLabel?: string;
  className?: string;
};

export function tabIds(idPrefix: string, id: string): { tabId: string; panelId: string } {
  return { tabId: `${idPrefix}-tab-${id}`, panelId: `${idPrefix}-panel-${id}` };
}

/** Spread on the panel element: role, id, aria-labelledby, tabIndex. */
export function tabPanelProps(idPrefix: string, id: string) {
  const { tabId, panelId } = tabIds(idPrefix, id);
  return { role: 'tabpanel' as const, id: panelId, 'aria-labelledby': tabId, tabIndex: 0 };
}

/**
 * Underline tabs on a 1px rule. Arrow keys / Home / End move between tabs and select them (automatic activation);
 * only the selected tab is in the Tab order.
 */
export function Tabs({ items, value, onChange, idPrefix = 'tabs', ariaLabel, className }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (index: number) => {
    const count = items.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    const item = items[next];
    if (!item) return;
    onChange(item.id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        move(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        move(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        move(0);
        break;
      case 'End':
        e.preventDefault();
        move(items.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex gap-6 overflow-x-auto border-b border-rule px-1 [scrollbar-width:none]', className)}
    >
      {items.map((item, i) => {
        const selected = item.id === value;
        const { tabId, panelId } = tabIds(idPrefix, item.id);
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'relative h-10 shrink-0 whitespace-nowrap text-body font-normal transition-colors duration-150',
              selected
                ? 'text-text after:absolute after:-inset-x-1 after:-bottom-px after:h-0.5 after:bg-text'
                : 'text-muted hover:text-text',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
