'use client';

import { useRef, type KeyboardEvent } from 'react';
import type { Objective } from '@cvc/schemas';
import { cn } from '@/lib/cn';

export const OBJECTIVES: { id: Objective; label: string; hint: string }[] = [
  { id: 'awareness', label: 'รับรู้แบรนด์', hint: 'เน้นยอดวิวและการเข้าถึงคนจำนวนมาก' },
  { id: 'launch', label: 'เปิดตัวสินค้า', hint: 'เน้นสร้างกระแสช่วงเปิดตัว ผสมครีเอเตอร์หลายขนาด' },
  { id: 'conversion', label: 'เพิ่มยอดขาย', hint: 'เน้นครีเอเตอร์ที่พาคนไปซื้อได้จริง' },
  { id: 'tiktok_shop', label: 'TikTok Shop', hint: 'เน้นคลิปติดตะกร้าและไลฟ์ขายของ' },
  { id: 'brand_building', label: 'สร้างแบรนด์ระยะยาว', hint: 'เน้นความเข้ากับแบรนด์และการทำงานร่วมกันต่อเนื่อง' },
  { id: 'ugc', label: 'คอนเทนต์ UGC', hint: 'เน้นคลิปรีวิวที่แบรนด์นำไปใช้ต่อได้' },
];

export function objectiveLabel(o: Objective): string {
  return OBJECTIVES.find((x) => x.id === o)?.label ?? o;
}

export type ObjectiveControlProps = {
  value: Objective;
  onChange: (o: Objective) => void;
  labelledBy: string;
  describedBy?: string;
};

/** Segmented control with radio semantics: arrow keys move and select, one tab stop. */
export function ObjectiveControl({ value, onChange, labelledBy, describedBy }: ObjectiveControlProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (index: number) => {
    const n = OBJECTIVES.length;
    const i = ((index % n) + n) % n;
    const item = OBJECTIVES[i];
    if (!item) return;
    onChange(item.id);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      select(i + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      select(i - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      select(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      select(OBJECTIVES.length - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="grid grid-cols-2 gap-0.5 rounded-card bg-raised p-0.5 sm:inline-grid sm:grid-cols-3 md:flex md:w-max md:max-w-full md:flex-wrap"
    >
      {OBJECTIVES.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'h-11 whitespace-nowrap rounded-control px-3 text-label transition-colors duration-150 sm:h-8',
              on ? 'border border-border bg-surface font-normal text-text' : 'border border-transparent font-light text-muted hover:text-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
