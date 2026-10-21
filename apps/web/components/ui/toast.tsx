'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useMounted } from './use-mounted';

export type ToastTone = 'neutral' | 'positive' | 'negative';
type ToastItem = { id: number; message: string; tone: ToastTone };
type ToastApi = { show(message: string, tone?: ToastTone): void };

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 4000;

/** Bottom-right, one line, 4s. Announced politely to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'neutral') => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted
        ? createPortal(
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
            >
              {items.map((t) => (
                <div
                  key={t.id}
                  className="pointer-events-auto flex max-w-[420px] animate-fade-in items-center gap-2.5 rounded-card border border-border bg-surface px-4 py-3 text-body text-text shadow-float"
                >
                  {t.tone === 'positive' ? (
                    <CircleCheck aria-hidden className="size-4 shrink-0 text-positive" strokeWidth={1.75} />
                  ) : t.tone === 'negative' ? (
                    <CircleAlert aria-hidden className="size-4 shrink-0 text-negative" strokeWidth={1.75} />
                  ) : null}
                  <span className={cn('min-w-0 truncate')}>{t.message}</span>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
