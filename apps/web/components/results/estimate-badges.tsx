'use client';

import type { Confidence } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { ASSUMPTION_NOTE_TH, CONFIDENCE_LABEL, CONFIDENCE_TONE } from './labels';

/** สูง / ปานกลาง / ต่ำ on every KPI estimate (UI_CONTRACT §7.4). */
export function ConfidenceBadge({ confidence, prefix = 'ความมั่นใจ' }: { confidence: Confidence; prefix?: string }) {
  return (
    <Badge tone={CONFIDENCE_TONE[confidence]}>
      {prefix}
      {CONFIDENCE_LABEL[confidence]}
    </Badge>
  );
}

/** Warning badge for estimates built on assumption_to_calibrate benchmarks; the note sits in a tooltip. */
export function AssumptionBadge({ note = ASSUMPTION_NOTE_TH }: { note?: string }) {
  return (
    <Tooltip content={<span className="block max-w-[280px]">{note}</span>}>
      <span tabIndex={0} aria-label={`สมมติฐาน: ${note}`} className="inline-flex rounded-chip">
        <Badge tone="warning">สมมติฐาน</Badge>
      </span>
    </Tooltip>
  );
}
