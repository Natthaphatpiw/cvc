import { delay, errorMessage } from '../lib/async';
import { isNonRetryable, isRunInactive } from './context';
import { runKolMatch, type PipelineOutcome } from './plan';
import { markRunFailed } from './steps/finalize';

const INLINE_ATTEMPTS = 3;

/** Mirrors the queue's retries: a step is retried a few times unless it threw a non-retryable error. */
async function attempt<T>(name: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= INLINE_ATTEMPTS; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (isNonRetryable(err) || i === INLINE_ATTEMPTS) break;
      console.warn(`[agent] inline step ${name} failed (attempt ${i}), retrying`, errorMessage(err));
      await delay(1000 * i);
    }
  }
  throw lastError;
}

/**
 * Runs the pipeline in-process without the queue (local development and demos only; production always uses Upstash
 * Workflow). Steps are checkpointed, so a later retry resumes where this stopped.
 */
export async function runPipelineInline(runId: string): Promise<PipelineOutcome> {
  try {
    return await runKolMatch(runId, attempt);
  } catch (err) {
    // The run was cancelled (or finished elsewhere) while running: nothing to mark.
    if (isRunInactive(err)) return { resultId: null, status: 'stopped' };
    const message = errorMessage(err);
    console.error('[agent] inline pipeline failed', runId, message);
    try {
      await markRunFailed(runId, message);
    } catch (markErr) {
      console.error('[agent] could not mark run failed', runId, errorMessage(markErr));
    }
    return { resultId: null, status: 'failed' };
  }
}
