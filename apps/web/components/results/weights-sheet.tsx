'use client';

import { useEffect, useId, useState } from 'react';
import type { FinalResult, GroupWeights, Objective, RescoreRequest } from '@cvc/schemas';
import { ApiError, agentApi } from '@/lib/api';
import { formatPct } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { GROUP_LABEL, GROUP_ORDER, OBJECTIVE_LABEL, OBJECTIVE_ORDER } from './labels';

const CUSTOM = 'custom';

function toPoints(w: GroupWeights): GroupWeights {
  return {
    fit: Math.round(w.fit * 100),
    audience: Math.round(w.audience * 100),
    performance: Math.round(w.performance * 100),
    trust: Math.round(w.trust * 100),
    cost: Math.round(w.cost * 100),
  };
}

/** Slider points (any scale) → weights that sum to 1. */
export function normalizeWeights(points: GroupWeights): GroupWeights | null {
  const sum = GROUP_ORDER.reduce((acc, g) => acc + Math.max(0, points[g]), 0);
  if (sum <= 0) return null;
  return {
    fit: Math.max(0, points.fit) / sum,
    audience: Math.max(0, points.audience) / sum,
    performance: Math.max(0, points.performance) / sum,
    trust: Math.max(0, points.trust) / sum,
    cost: Math.max(0, points.cost) / sum,
  };
}

function isObjective(v: string): v is Objective {
  return (OBJECTIVE_ORDER as readonly string[]).includes(v);
}

/**
 * View-only what-if: five sliders (normalised to 100%) or a preset → rescore with save:false.
 * The page shows the preview with a notice and offers to save it as a new version.
 */
export function WeightsSheet({
  open,
  onClose,
  resultId,
  current,
  onPreview,
}: {
  open: boolean;
  onClose: () => void;
  resultId: string;
  /** Methodology of the result on screen (saved or previewed). */
  current: FinalResult['methodology'];
  /** `preset` is set when the preview came from the preset select, so saving it can keep that preset's name. */
  onPreview: (result: FinalResult, preset: Objective | null) => void;
}) {
  const [points, setPoints] = useState<GroupWeights>(() => toPoints(current.weights));
  const [preset, setPreset] = useState<string>(current.preset);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();

  // Re-sync when the sheet opens on a different result/preview.
  useEffect(() => {
    if (!open) return;
    setPoints(toPoints(current.weights));
    setPreset(current.preset);
    setError(null);
  }, [open, current]);

  const normalized = normalizeWeights(points);

  async function run(body: RescoreRequest, closeAfter: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await agentApi.rescore(resultId, body);
      setPoints(toPoints(res.result.methodology.weights));
      onPreview(res.result, body.preset ?? null);
      if (closeAfter) onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.messageTh : 'คำนวณอันดับใหม่ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setPending(false);
    }
  }

  function onPresetChange(value: string) {
    setPreset(value);
    if (isObjective(value)) void run({ preset: value, save: false }, false);
  }

  function onSlider(g: keyof GroupWeights, value: number) {
    setPoints((p) => ({ ...p, [g]: value }));
    setPreset(CUSTOM);
  }

  return (
    <Sheet open={open} onClose={onClose} title="ปรับน้ำหนักคะแนน">
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (normalized) void run({ weights: normalized, save: false }, true);
        }}
      >
        <p className="text-label font-light text-muted">
          ลองเปลี่ยนน้ำหนักเพื่อดูว่าอันดับเปลี่ยนอย่างไร ระบบคำนวณจากคะแนนเดิมโดยไม่วิเคราะห์ใหม่ และยังไม่บันทึกจนกว่าจะกดบันทึกเป็นเวอร์ชันใหม่
        </p>

        <Field label="สูตรสำเร็จ" hint="เลือกแล้วจะคำนวณอันดับใหม่ทันที">
          <Select value={preset} onChange={(e) => onPresetChange(e.target.value)} disabled={pending}>
            {OBJECTIVE_ORDER.map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_LABEL[o]}
              </option>
            ))}
            <option value={CUSTOM}>กำหนดเอง</option>
          </Select>
        </Field>

        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 text-label font-normal text-text">น้ำหนักแต่ละกลุ่ม</legend>
          {GROUP_ORDER.map((g) => {
            const id = `${baseId}-${g}`;
            return (
              <div key={g} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
                <label htmlFor={id} className="text-body font-light text-text">
                  {GROUP_LABEL[g]}
                </label>
                <span className="text-right text-body font-normal tabular-nums text-text" aria-hidden="true">
                  {normalized ? formatPct(normalized[g], 0) : '0%'}
                </span>
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={points[g]}
                  onChange={(e) => onSlider(g, Number(e.target.value))}
                  aria-valuetext={normalized ? formatPct(normalized[g], 0) : '0%'}
                  className="col-span-2 h-6 w-full cursor-pointer accent-accent"
                  disabled={pending}
                />
              </div>
            );
          })}
          <p className="text-meta font-light text-muted">
            น้ำหนักจะถูกปรับให้รวมกันได้ 100% อัตโนมัติ
          </p>
        </fieldset>

        {error ? (
          <p role="alert" className="text-label font-light text-negative">
            {error}
          </p>
        ) : null}
        {!normalized ? (
          <p role="alert" className="text-label font-light text-negative">
            ต้องมีอย่างน้อยหนึ่งกลุ่มที่น้ำหนักมากกว่า 0
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-rule pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            ยกเลิก
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!normalized || pending}>
            คำนวณอันดับใหม่
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
