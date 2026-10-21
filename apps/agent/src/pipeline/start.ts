import { after } from 'next/server';
import { start } from 'workflow/api';
import { errorMessage } from '../lib/async';
import { runPipelineInline } from './inline';
import { kolMatchWorkflow } from './workflows/kol-match';

export type PipelineStart = { mode: 'workflow'; workflowRunId: string } | { mode: 'inline' };

let warnedInline = false;

/**
 * Starts the durable workflow (region sin1, §3.5). When the Workflow runtime is unavailable (e.g. the directives were
 * not compiled, or no World can be reached) the same steps run inline after the response via `after()`.
 */
export async function startPipeline(runId: string): Promise<PipelineStart> {
  try {
    const run = await start(kolMatchWorkflow, [{ runId }], { region: 'sin1' });
    return { mode: 'workflow', workflowRunId: run.runId };
  } catch (err) {
    if (!warnedInline) {
      warnedInline = true;
      console.warn('[agent] Workflow runtime unavailable; running pipelines inline after the response.', errorMessage(err));
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
}
