import { requireCron } from '@cvc/auth';
import { dedupe } from '@cvc/cache';
import { getAgentStore, type AgentStore, type RunRecord } from '@cvc/db';
import { Hono } from 'hono';
import type { AppEnv } from '../http';
import { errorMessage } from '../lib/async';
import { cancelWorkflowRun, queueRunState } from '../pipeline/queue';

const STUCK_AFTER_MINUTES = 15;
/**
 * Queued runs share one flow-control key, so a run can wait in QStash for a while without writing progress. Those are
 * only failed when QStash says the run ended without our pipeline finishing it, or after this hard upper bound.
 */
const QUEUE_STUCK_AFTER_MINUTES = 120;
const STUCK_MESSAGE_TH = 'การวิเคราะห์ใช้เวลานานผิดปกติและถูกหยุดไว้ กรุณาลองใหม่อีกครั้ง';

async function failStuckRun(store: AgentStore, run: RunRecord): Promise<void> {
  if (run.workflowRunId) {
    try {
      await cancelWorkflowRun(run.workflowRunId);
    } catch (err) {
      console.warn('[agent] cancel stuck workflow failed', run.workflowRunId, errorMessage(err));
    }
  }
  await store.updateRun(run.id, { status: 'failed', errorMessageTh: STUCK_MESSAGE_TH, completedAt: new Date().toISOString() });
  await store.appendProgress(run.id, { stage: run.stage ?? 'intake', status: 'failed', pct: run.progressPct, messageTh: STUCK_MESSAGE_TH });
  try {
    await dedupe.del(run.ownerId, run.inputHash);
  } catch (err) {
    console.warn('[agent] dedupe.del failed', errorMessage(err));
  }
}

/** Vercel Cron jobs (§8.5); `Authorization: Bearer $CRON_SECRET`. */
export function cronRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/cron/requeue-stuck', requireCron(), async (c) => {
    const store = getAgentStore();
    // already excludes terminal runs and awaiting_review (waits on a person, not on the pipeline)
    const stale = await store.listStaleRuns(STUCK_AFTER_MINUTES);
    const now = Date.now();
    let failed = 0;
    let waiting = 0;
    for (const run of stale) {
      try {
        if (run.workflowRunId) {
          const idleMinutes = (now - Date.parse(run.updatedAt)) / 60_000;
          const state = await queueRunState(run.workflowRunId);
          // still queued or between steps in QStash: leave it unless it has been idle past the hard bound
          if (state !== 'ended' && idleMinutes < QUEUE_STUCK_AFTER_MINUTES) {
            waiting += 1;
            continue;
          }
        }
        await failStuckRun(store, run);
        failed += 1;
      } catch (err) {
        console.error('[agent] requeue-stuck could not fail run', run.id, errorMessage(err));
      }
    }
    return c.json({ ok: true, checked: stale.length, failed, waiting });
  });

  // MVP keeps every run and result. Phase 2 implements §8.5 here: delete chat threads and expired guest runs/results,
  // raw/ blobs older than 30 days, uploads/ older than 24 hours, stale creators, then call api purge-anon-users.
  r.get('/cron/retention', requireCron(), (c) => c.json({ ok: true, purged: { runs: 0, results: 0, blobs: 0 }, mode: 'mvp_noop' }));

  return r;
}
