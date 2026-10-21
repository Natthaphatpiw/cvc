import { FatalError } from 'workflow';
import { delay, errorMessage } from '../lib/async';
import { RUN_INACTIVE } from './context';
import { brandStep } from './steps/brand';
import { curateStep } from './steps/curate';
import { discoverStep, planQueriesStep } from './steps/discover';
import { enrichBatchStep } from './steps/enrich';
import { evaluateBatchStep, planEvaluationStep } from './steps/evaluate';
import { failRunStep, finalizeStep } from './steps/finalize';
import { normalizeStep } from './steps/normalize';
import { collectEvidenceStep, prefetchSourceStep } from './steps/prefetch';
import { rankStep } from './steps/rank';

const INLINE_ATTEMPTS = 3;

/** Mirrors the Workflow default of retrying a step a few times unless it threw FatalError. */
async function attempt<T>(name: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= INLINE_ATTEMPTS; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (FatalError.is(err) || i === INLINE_ATTEMPTS) break;
      console.warn(`[agent] inline step ${name} failed (attempt ${i}), retrying`, errorMessage(err));
      await delay(1000 * i);
    }
  }
  throw lastError;
}

/**
 * Runs the same step functions sequentially without the Workflow runtime (local tests, or when `start()` fails).
 * Steps are checkpointed, so a later retry resumes where this stopped.
 */
export async function runPipelineInline(runId: string): Promise<{ resultId: string | null; status: string }> {
  try {
    const { sources } = await attempt('normalize', () => normalizeStep(runId));
    await Promise.all(sources.map((source) => attempt(`prefetch.${source}`, () => prefetchSourceStep(runId, source))));
    await attempt('evidence', () => collectEvidenceStep(runId));
    await attempt('brand', () => brandStep(runId));
    await attempt('plan', () => planQueriesStep(runId));
    const discovered = await attempt('discover', () => discoverStep(runId));
    for (let b = 0; b < discovered.batchCount; b++) await attempt(`enrich.${b}`, () => enrichBatchStep(runId, b));
    const evaluation = await attempt('evaluate.plan', () => planEvaluationStep(runId));
    for (let b = 0; b < evaluation.batchCount; b++) await attempt(`evaluate.${b}`, () => evaluateBatchStep(runId, b));
    const ranking = await attempt('rank', () => rankStep(runId));
    if (ranking.ranked > 0) await attempt('curate', () => curateStep(runId));
    const final = await attempt('finalize', () => finalizeStep(runId));
    return { resultId: final.resultId, status: final.status };
  } catch (err) {
    const message = errorMessage(err);
    // The run was cancelled (or finished elsewhere) while running: nothing to mark.
    if (message === RUN_INACTIVE) return { resultId: null, status: 'stopped' };
    console.error('[agent] inline pipeline failed', runId, message);
    try {
      await failRunStep(runId, message);
    } catch (markErr) {
      console.error('[agent] could not mark run failed', runId, errorMessage(markErr));
    }
    return { resultId: null, status: 'failed' };
  }
}
