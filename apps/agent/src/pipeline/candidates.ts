import { getAgentStore, type CandidateRow } from '@cvc/db';
import { BATCH_SIZE, ENRICH_LIMIT, StepKey, type DiscoverCheckpoint, type EnrichCheckpoint } from './types';

/** Order candidates the way discovery ranked them (pre-score), unknown ones last. */
export function discoveryOrder(rows: CandidateRow[], discover: DiscoverCheckpoint | null): CandidateRow[] {
  const index = new Map<string, number>();
  (discover?.refs ?? []).forEach((r, i) => index.set(r.handle.toLowerCase(), i));
  const pos = (r: CandidateRow) => index.get(r.handle.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => pos(a) - pos(b));
}

export type EnrichSummary = {
  /** creatorId → platformVideoId → cached public cover URL */
  covers: Record<string, Record<string, string | null>>;
  /** profiles fetched (enriched or excluded by gate 0b) */
  fetched: number;
  /** provider calls that threw */
  failed: number;
};

/** Cached cover URLs and fetch counts, collected from the enrich checkpoints. */
export async function loadEnrichSummary(runId: string): Promise<EnrichSummary> {
  const store = getAgentStore();
  const batches = Math.ceil(ENRICH_LIMIT / BATCH_SIZE);
  const checkpoints = await Promise.all(
    Array.from({ length: batches }, (_, b) => store.getStep<EnrichCheckpoint>(runId, StepKey.enrich(b))),
  );
  const out: EnrichSummary = { covers: {}, fetched: 0, failed: 0 };
  for (const cp of checkpoints) {
    if (!cp) continue;
    Object.assign(out.covers, cp.covers);
    out.fetched += cp.enriched + cp.excluded;
    out.failed += cp.failed;
  }
  return out;
}

/** Cached cover URLs per creator, collected from the enrich checkpoints. */
export async function loadCovers(runId: string): Promise<Record<string, Record<string, string | null>>> {
  return (await loadEnrichSummary(runId)).covers;
}
