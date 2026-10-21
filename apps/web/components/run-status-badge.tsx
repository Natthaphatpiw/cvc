import type { RunStatus } from '@cvc/schemas';
import { Badge } from '@/components/ui/badge';
import { runStatusLabel, runStatusTone } from '@/lib/run-status';

export function RunStatusBadge({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <Badge tone={runStatusTone(status)} className={className}>
      {runStatusLabel(status)}
    </Badge>
  );
}
