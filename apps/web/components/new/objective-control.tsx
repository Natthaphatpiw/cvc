'use client';

import { useRef, type KeyboardEvent } from 'react';
import type { Objective } from '@cvc/schemas';
import { cn } from '@/lib/cn';
import { AiSparkleIcon } from '@/components/ui/ai-sparkle';

export const OBJECTIVES: { id: Objective; label: string; hint: string }[] = [
  { id: 'awareness', label: 'รับรู้แบรนด์', hint: 'เน้นยอดวิวและการเข้าถึงคนจำนวนมาก' },
  { id: 'launch', label: 'เปิดตัวสินค้า', hint: 'เน้นสร้างกระแสช่วงเปิดตัว ผสมครีเอเตอร์หลายขนาด' },
  { id: 'conversion', label: 'เพิ่มยอดขาย', hint: 'เน้นครีเอเตอร์ที่พาคนไปซื้อได้จริง' },
  { id: 'tiktok_shop', label: 'TikTok Shop', hint: 'เน้นคลิปติดตะกร้าและไลฟ์ขายของ' },
  { id: 'brand_building', label: 'สร้างแบรนด์ระยะยาว', hint: 'เน้นความเข้ากับแบรนด์และการทำงานร่วมกันต่อเนื่อง' },
  { id: 'ugc', label: 'คอนเทนต์ UGC', hint: 'เน้นคลิปรีวิวที่แบรนด์นำไปใช้ต่อได้' },
];

/** The first option: null = the agent picks the objective from its brand analysis (CampaignInput.objective null). */
export const AUTO_OBJECTIVE = {
  id: null,
  label: 'ระบบเลือกให้',
  hint: 'ระบบจะเลือกเป้าหมายจากผลวิเคราะห์แบรนด์ และบอกเหตุผลไว้ในหน้าผลลัพธ์',
} as const;

const OPTIONS: { id: Objective | null; label: string; hint: string }[] = [AUTO_OBJECTIVE, ...OBJECTIVES];

export function objectiveLabel(o: Objective | null): string {
  if (o === null) return AUTO_OBJECTIVE.label;
  return OBJECTIVES.find((x) => x.id === o)?.label ?? o;
}

export function objectiveHint(o: Objective | null): string {
  return OPTIONS.find((x) => x.id === o)?.hint ?? '';
}

export type ObjectiveControlProps = {
  /** null = "ระบบเลือกให้". */
  value: Objective | null;
  onChange: (o: Objective | null) => void;
  labelledBy: string;
  describedBy?: string;
};

/**
 * Segmented control with radio semantics: arrow keys move and select, one tab stop. "ระบบเลือกให้" (null) is a
 * real option, so the group always has a checked radio to tab to.
 */
export function ObjectiveControl({ value, onChange, labelledBy, describedBy }: ObjectiveControlProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const checked = Math.max(0, OPTIONS.findIndex((o) => o.id === value));

  const select = (index: number) => {
    const n = OPTIONS.length;
    const i = ((index % n) + n) % n;
    const item = OPTIONS[i];
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
      select(OPTIONS.length - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="grid grid-cols-2 gap-1 rounded-card bg-raised p-1 sm:grid-cols-4"
    >
      {OPTIONS.map((o, i) => {
        const on = i === checked;
        const auto = o.id === null;
        return (
          <button
            key={o.id ?? 'auto'}
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
              'inline-flex h-11 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] px-2 text-label transition-colors duration-150 sm:h-9',
              auto && 'col-span-2 sm:col-span-1',
              on ? 'bg-accent font-normal text-white' : 'font-light text-muted hover:bg-surface hover:text-text',
            )}
          >
            {auto ? <AiSparkleIcon size={14} tone={on ? 'current' : 'gradient'} /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
