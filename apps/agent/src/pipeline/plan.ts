import { brandStep } from './steps/brand';
import { curateStep } from './steps/curate';
import { discoverStep, planQueriesStep } from './steps/discover';
import { enrichBatchStep } from './steps/enrich';
import { evaluateBatchStep, planEvaluationStep } from './steps/evaluate';
import { finalizeStep } from './steps/finalize';
import { normalizeStep } from './steps/normalize';
import { collectEvidenceStep, prefetchSourceStep } from './steps/prefetch';
import { rankStep } from './steps/rank';

/**
 * Runs one named step. Upstash Workflow passes `(name, fn) => context.run(name, fn)`, which memoizes the result; the
 * inline runner retries `fn` in-process. Names must stay unique and stable across deploys: Upstash matches them
 * against the steps already recorded for a run.
 */
export type StepRunner = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export type PipelineOutcome = { resultId: string | null; status: string };

/**
 * KOL matching pipeline (MVP §17.5), shared by both runners. Under Upstash Workflow this function is re-executed from
 * the top for every step call and only step results are replayed, so everything outside `step` must be deterministic
 * and free of side effects, and nothing here may catch errors (the SDK aborts with errors after each step). Step
 * results are IDs and counts only; all data moves through the AgentStore inside the steps, which checkpoint their own
 * output so a retried step resumes instead of redoing paid work.
 */
export async function runKolMatch(runId: string, step: StepRunner): Promise<PipelineOutcome> {
  const { sources } = await step('normalize', () => normalizeStep(runId));
  await Promise.all(sources.map((source) => step(`prefetch:${source}`, () => prefetchSourceStep(runId, source))));
  await step('evidence', () => collectEvidenceStep(runId));
  await step('brand', () => brandStep(runId));
  await step('plan-queries', () => planQueriesStep(runId));
  const discovered = await step('discover', () => discoverStep(runId));
  for (let b = 0; b < discovered.batchCount; b++) await step(`enrich:${b}`, () => enrichBatchStep(runId, b));
  const evaluation = await step('plan-evaluation', () => planEvaluationStep(runId));
  for (let b = 0; b < evaluation.batchCount; b++) await step(`evaluate:${b}`, () => evaluateBatchStep(runId, b));
  const ranking = await step('rank', () => rankStep(runId));
  if (ranking.ranked > 0) await step('curate', () => curateStep(runId));
  const final = await step('finalize', () => finalizeStep(runId));
  return { resultId: final.resultId, status: final.status };
}
