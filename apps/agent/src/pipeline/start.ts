import { after } from 'next/server';
import { errorMessage } from '../lib/async';
import { runPipelineInline } from './inline';
import {
  KOL_MATCH_FLOW_CONTROL_KEY,
  KOL_MATCH_LABEL,
  kolMatchWorkflowUrl,
  maxParallelRuns,
  runnerMode,
  vercelBypassHeaders,
  workflowClient,
  workflowRunIdFor,
} from './queue';
import type { KolMatchPayload } from './workflows/kol-match';

export type PipelineStart = { mode: 'upstash'; workflowRunId: string } | { mode: 'inline' };

/** No runner may start the pipeline here (production without QStash). */
export class QueueNotConfiguredError extends Error {
  constructor() {
    super('pipeline queue (QStash) is not configured');
    this.name = 'QueueNotConfiguredError';
  }
}

const TRIGGER_RETRIES = 3;
/**
 * QStash's default backoff (about 12 s, 2.5 min, then 30 min) left a failing step's run spinning for half an hour.
 * 10 s, 20 s, 40 s keeps a transient outage covered and fails a run that cannot recover within about a minute.
 */
const TRIGGER_RETRY_DELAY = 'min(60000, 10000 * pow(2, retried))';

/**
 * Hands the run to Upstash Workflow and returns as soon as QStash accepted it; QStash then calls
 * /api/workflow/kol-match once per step, so no request waits for the pipeline. Without QStash (local/demo only) the
 * steps run inline after the response via `after()`.
 */
export async function startPipeline(runId: string): Promise<PipelineStart> {
  const mode = runnerMode();
  if (mode === 'unavailable') throw new QueueNotConfiguredError();

  if (mode === 'upstash') {
    const body: KolMatchPayload = { runId };
    const headers = vercelBypassHeaders();
    const { workflowRunId } = await workflowClient().trigger({
      url: kolMatchWorkflowUrl(),
      body,
      // Same id for the same run, so a repeated trigger is deduplicated by QStash instead of starting a second run.
      workflowRunId: workflowRunIdFor(runId),
      retries: TRIGGER_RETRIES,
      retryDelay: TRIGGER_RETRY_DELAY,
      flowControl: { key: KOL_MATCH_FLOW_CONTROL_KEY, parallelism: maxParallelRuns() },
      label: KOL_MATCH_LABEL,
      ...(headers ? { headers } : {}),
    });
    return { mode: 'upstash', workflowRunId };
  }

  const run = async (): Promise<void> => {
    await runPipelineInline(runId);
  };
  try {
    after(run);
  } catch (afterErr) {
    // Outside a Next request scope (scripts, tests): run detached instead of leaving the run queued.
    console.warn('[agent] after() unavailable; running the pipeline detached', errorMessage(afterErr));
    void run().catch((e: unknown) => console.error('[agent] detached pipeline failed', runId, errorMessage(e)));
  }
  return { mode: 'inline' };
}
