import { WorkflowNonRetryableError, type WorkflowContext } from '@upstash/workflow';
import { serve } from '@upstash/workflow/nextjs';
import { errorResponse } from '../../http';
import { RUN_INACTIVE, isRunInactive } from '../context';
import { runKolMatch, type PipelineOutcome, type StepRunner } from '../plan';
import {
  QUEUE_NOT_CONFIGURED_CODE,
  QUEUE_NOT_CONFIGURED_TH,
  isQStashSigningConfigured,
  runIdFromWorkflowRunId,
  upstashEnv,
  vercelBypassHeaders,
} from '../queue';
import { markRunFailed } from '../steps/finalize';

export type KolMatchPayload = { runId: string };

/** What a step memoizes: `inactive` means the run was cancelled or finished elsewhere while the step ran. */
type StepEnvelope<T> = { inactive: true } | { inactive?: false; value: T };

function payloadRunId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const runId = (payload as { runId?: unknown }).runId;
  return typeof runId === 'string' && runId.trim().length > 0 ? runId : null;
}

/**
 * Maps the shared plan's steps onto context.run. A RUN_INACTIVE stop is returned as a value instead of thrown, so the
 * run is then cancelled through context.cancel(): QStash records it as cancelled, without the failure function or DLQ.
 * Any other error propagates unchanged (non-retryable ones fail the run at once, others are retried by QStash).
 */
function upstashStep(context: WorkflowContext<KolMatchPayload>, runId: string): StepRunner {
  return async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const out = await context.run(name, async (): Promise<StepEnvelope<T>> => {
      // Logged inside the step body, so only when the step really executes (not on replays).
      const t0 = Date.now();
      console.info(`[agent] step ${name} start run=${runId}`);
      try {
        const value = await fn();
        console.info(`[agent] step ${name} done run=${runId} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
        return { value };
      } catch (err) {
        if (isRunInactive(err)) return { inactive: true };
        console.error(
          `[agent] step ${name} failed run=${runId} after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    });
    if (out.inactive) {
      await context.cancel();
      // context.cancel() always throws to stop the run; this only guards against that changing.
      throw new WorkflowNonRetryableError(RUN_INACTIVE);
    }
    return out.value;
  };
}

async function kolMatchWorkflow(context: WorkflowContext<KolMatchPayload>): Promise<PipelineOutcome> {
  const runId = payloadRunId(context.requestPayload);
  if (!runId) throw new WorkflowNonRetryableError('kol-match workflow payload has no runId');
  return runKolMatch(runId, upstashStep(context, runId));
}

function createHandler(): (request: Request) => Promise<Response> {
  const bypass = vercelBypassHeaders();
  const { POST } = serve<KolMatchPayload, PipelineOutcome>(kolMatchWorkflow, {
    env: upstashEnv(),
    // Step calls are published by this endpoint's QStash client; its global headers are forwarded to every step call,
    // which the trigger's headers are not (the SDK drops incoming x-vercel-* headers from context.headers).
    ...(bypass ? { qstashClient: { headers: bypass } } : {}),
    // Called once QStash gives up on a step (retries exhausted) or a step threw WorkflowNonRetryableError.
    failureFunction: async ({ context, failResponse }) => {
      const runId = payloadRunId(context.requestPayload) ?? runIdFromWorkflowRunId(context.workflowRunId);
      if (!runId) return 'run id unknown';
      if (failResponse === RUN_INACTIVE) return 'run inactive';
      // No-op when the run is already terminal (cancelled, completed, failed), so repeated calls are harmless.
      await markRunFailed(runId, failResponse);
      return 'run marked failed';
    },
  });
  return POST;
}

let handler: ((request: Request) => Promise<Response>) | undefined;

/** POST /api/workflow/kol-match: called only by QStash; serve() verifies the Upstash-Signature header. */
export async function handleKolMatchWorkflow(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production' && !isQStashSigningConfigured()) {
    // Without signing keys serve() would accept unsigned calls; refuse instead of running unverified work.
    console.error('[agent] QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY are not set; workflow call refused');
    return errorResponse(503, QUEUE_NOT_CONFIGURED_CODE, QUEUE_NOT_CONFIGURED_TH);
  }
  handler ??= createHandler();
  return handler(request);
}
