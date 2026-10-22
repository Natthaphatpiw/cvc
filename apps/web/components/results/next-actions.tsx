'use client';

import { useCallback, useId, useMemo, useSyncExternalStore } from 'react';
import type { NextAction } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { ACTION_CATEGORY_LABEL, dueLabel, OWNER_LABEL, OWNER_ORDER } from './labels';
import { cn } from '@/lib/cn';

// Checkbox state lives in localStorage per result; a tiny external store keeps the plan rail and the
// creator sheet in sync within the tab, and the 'storage' event syncs other tabs.
const listeners = new Set<() => void>();
const keyFor = (resultId: string) => `cvc:next-actions:${resultId}`;

function readRaw(resultId: string): string {
  try {
    return window.localStorage.getItem(keyFor(resultId)) ?? '[]';
  } catch {
    return '[]';
  }
}

function writeIds(resultId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(keyFor(resultId), JSON.stringify(ids));
  } catch {
    // private mode or quota: the checklist still works for this render, it just is not remembered
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function parseIds(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function useDoneActions(resultId: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(resultId),
    () => '[]',
  );
  const done = useMemo(() => new Set(parseIds(raw)), [raw]);
  const toggle = useCallback(
    (id: string) => {
      const next = new Set(parseIds(readRaw(resultId)));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeIds(resultId, [...next]);
    },
    [resultId],
  );
  return { done, toggle };
}

function ActionRow({
  action,
  checked,
  onToggle,
  readOnly,
  showOwner,
}: {
  action: NextAction;
  checked: boolean;
  onToggle: () => void;
  readOnly: boolean;
  showOwner: boolean;
}) {
  const id = useId();
  const meta = (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-meta font-light text-muted">
      {showOwner ? <Badge tone="neutral">{OWNER_LABEL[action.owner]}</Badge> : null}
      <Badge tone="neutral">{ACTION_CATEGORY_LABEL[action.category]}</Badge>
      <span>{dueLabel(action.dueInDays)}</span>
    </span>
  );

  if (readOnly) {
    return (
      <li className="py-2.5">
        <p className="text-body font-normal text-text">{action.titleTh}</p>
        {action.detailTh ? <p className="text-label font-light text-muted">{action.detailTh}</p> : null}
        {meta}
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 py-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-[3px] size-4 shrink-0 cursor-pointer rounded-[4px] accent-accent"
      />
      <div className="min-w-0">
        <label
          htmlFor={id}
          className={cn(
            'cursor-pointer text-body font-normal',
            checked ? 'text-muted line-through' : 'text-text',
          )}
        >
          {action.titleTh}
        </label>
        {action.detailTh ? <p className="text-label font-light text-muted">{action.detailTh}</p> : null}
        {meta}
      </div>
    </li>
  );
}

/** Next actions as a checklist, optionally grouped by owner (นักวางแผน / ลูกค้า / ครีเอเตอร์). */
export function NextActionList({
  actions,
  resultId,
  readOnly = false,
  groupByOwner = true,
}: {
  actions: readonly NextAction[];
  resultId: string;
  readOnly?: boolean;
  groupByOwner?: boolean;
}) {
  const { done, toggle } = useDoneActions(resultId);
  const sorted = useMemo(() => [...actions].sort((a, b) => a.dueInDays - b.dueInDays), [actions]);

  if (sorted.length === 0) {
    return <p className="text-label font-light text-muted">ยังไม่มีขั้นตอนถัดไป</p>;
  }

  if (!groupByOwner) {
    return (
      <ul className="divide-y divide-rule">
        {sorted.map((a) => (
          <ActionRow key={a.id} action={a} checked={done.has(a.id)} onToggle={() => toggle(a.id)} readOnly={readOnly} showOwner />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {OWNER_ORDER.map((owner) => {
        const group = sorted.filter((a) => a.owner === owner);
        if (group.length === 0) return null;
        const doneCount = group.filter((a) => done.has(a.id)).length;
        return (
          <section key={owner} aria-label={OWNER_LABEL[owner]}>
            <h4 className="flex items-baseline justify-between text-label font-normal text-text">
              <span>{OWNER_LABEL[owner]}</span>
              {readOnly ? null : (
                <span className="text-meta font-light text-muted tabular-nums">
                  เสร็จ {doneCount}/{group.length}
                </span>
              )}
            </h4>
            <ul className="divide-y divide-rule">
              {group.map((a) => (
                <ActionRow
                  key={a.id}
                  action={a}
                  checked={done.has(a.id)}
                  onToggle={() => toggle(a.id)}
                  readOnly={readOnly}
                  showOwner={false}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
