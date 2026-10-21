import { brandStep } from '../steps/brand';
import { curateStep } from '../steps/curate';
import { discoverStep, planQueriesStep } from '../steps/discover';
import { enrichBatchStep } from '../steps/enrich';
import { evaluateBatchStep, planEvaluationStep } from '../steps/evaluate';
import { failRunStep, finalizeStep } from '../steps/finalize';
import { normalizeStep } from '../steps/normalize';
import { collectEvidenceStep, prefetchSourceStep } from '../steps/prefetch';
import { rankStep } from '../steps/rank';

/**
 * KOL matching pipeline (MVP §17.5). Deterministic orchestration only: every argument and return value is an ID or a
 * count; all data moves through the AgentStore inside the steps.
 */
export async function kolMatchWorkflow(input: { runId: string }): Promise<{ resultId: string | null; status: string }> {
  'use workflow';
  const { runId } = input;
  try {
    const { sources } = await normalizeStep(runId);
    await Promise.all(sources.map((source) => prefetchSourceStep(runId, source)));
    await collectEvidenceStep(runId);
    await brandStep(runId);
    await planQueriesStep(runId);
    const discovered = await discoverStep(runId);
    for (let b = 0; b < discovered.batchCount; b++) await enrichBatchStep(runId, b);
    const evaluation = await planEvaluationStep(runId);
    for (let b = 0; b < evaluation.batchCount; b++) await evaluateBatchStep(runId, b);
    const ranking = await rankStep(runId);
    if (ranking.ranked > 0) await curateStep(runId);
    const final = await finalizeStep(runId);
    return { resultId: final.resultId, status: final.status };
  } catch (err) {
    await failRunStep(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
