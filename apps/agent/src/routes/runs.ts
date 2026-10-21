import { randomSecret, requireEdge, requireUser, sha256Hex } from '@cvc/auth';
import { dedupe } from '@cvc/cache';
import { getAgentStore, inputHash as computeInputHash, type RunRecord } from '@cvc/db';
import {
  RunInput,
  TERMINAL_STATUSES,
  type CreateRunResponse,
  type RunEventsResponse,
  type RunStatus,
  type RunStatusResponse,
} from '@cvc/schemas';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { isDemoRun } from '../env';
import {
  ApiFailure,
  currentUser,
  enforceRateLimit,
  isGuest,
  loadOwnedRun,
  readJson,
  validationFailure,
  type AppEnv,
} from '../http';
import { errorMessage } from '../lib/async';
import { QUEUE_NOT_CONFIGURED_CODE, QUEUE_NOT_CONFIGURED_TH, cancelWorkflowRun } from '../pipeline/queue';
import { QueueNotConfiguredError, startPipeline } from '../pipeline/start';

const DEDUPE_TTL_SEC = 24 * 3600;
const STREAM_MAX_MS = 290_000;
const STREAM_POLL_MS = 1000;

/** A previous run is reused only while it is running or completed (§4.2: failed/cancelled/partial are retried). */
const REUSABLE: ReadonlySet<RunStatus> = new Set<RunStatus>([
  'queued',
  'normalizing',
  'prefetching',
  'researching_brand',
  'awaiting_review',
  'discovering',
  'evaluating',
  'ranking',
  'curating',
  'completed',
]);

/** Rough remaining seconds per status for a live run (§16.1 latency budget); demo runs only wait on the stage delay. */
const ETA_SEC: Partial<Record<RunStatus, number>> = {
  queued: 330,
  normalizing: 310,
  prefetching: 280,
  researching_brand: 220,
  discovering: 160,
  evaluating: 95,
  ranking: 55,
  curating: 45,
};

function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

function etaFor(run: RunRecord): number | null {
  const base = ETA_SEC[run.status];
  if (base === undefined) return null;
  return run.isDemo ? Math.max(5, Math.ceil(base / 15)) : base;
}

function statusBody(run: RunRecord): RunStatusResponse {
  return {
    runId: run.id,
    status: run.status,
    stage: run.stage,
    progressPct: run.progressPct,
    warnings: run.warnings,
    resultId: run.resultId,
    etaSec: etaFor(run),
    createdAt: run.createdAt,
    companyName: run.input.companyName,
    errorMessageTh: run.errorMessageTh,
  };
}

async function findReusableRun(ownerId: string, inputHash: string): Promise<RunRecord | null> {
  const store = getAgentStore();
  let run: RunRecord | null = null;
  try {
    const id = await dedupe.get(ownerId, inputHash);
    if (id) run = await store.getRun(id);
  } catch (err) {
    console.warn('[agent] dedupe lookup failed', errorMessage(err));
  }
  run ??= await store.findRecentRunByHash(ownerId, inputHash, 24);
  return run && run.ownerId === ownerId && REUSABLE.has(run.status) ? run : null;
}

function parseSeq(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function runRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const edge = requireEdge();
  const user = requireUser({ allowAnonymous: true });

  r.post('/runs', edge, user, async (c) => {
    const me = currentUser(c);
    const parsed = RunInput.safeParse(await readJson(c));
    if (!parsed.success) throw validationFailure(parsed.error.issues);
    const input = parsed.data;

    // IDOR guard (§4.2): every asset must live under the caller's own upload prefix.
    const prefix = `uploads/${me.id}/`;
    const pathnames = [...input.assets.map((a) => a.pathname), ...input.voiceTranscripts.map((v) => v.assetPathname)];
    if (pathnames.some((p) => !p.startsWith(prefix) || p.includes('..'))) {
      throw new ApiFailure(403, 'asset_forbidden', 'มีไฟล์แนบที่ไม่ได้อัปโหลดโดยบัญชีนี้ กรุณาอัปโหลดใหม่');
    }

    // Dedupe is scoped per owner (Redis key and findRecentRunByHash), so the hash itself is owner-independent.
    const inputHash = await computeInputHash(input);
    if (!input.options.force) {
      const existing = await findReusableRun(me.id, inputHash);
      if (existing) {
        const body: CreateRunResponse = { runId: existing.id, status: existing.status, claimSecret: null, deduped: true };
        return c.json(body, 202);
      }
    }

    await enforceRateLimit(`rl:run:${me.id}`, 5, 3600);

    const store = getAgentStore();
    const guest = isGuest(me);
    const claimSecret = guest ? randomSecret() : null;
    const run = await store.createRun({
      ownerId: me.id,
      ownerType: guest ? 'guest' : 'line',
      channel: input.channel,
      input,
      inputHash,
      claimSecretHash: claimSecret ? await sha256Hex(claimSecret) : null,
      isDemo: isDemoRun(),
    });
    await store.appendProgress(run.id, { stage: 'intake', status: 'completed', pct: 1, messageTh: 'รับคำขอแล้ว กำลังเริ่มวิเคราะห์' });
    try {
      await dedupe.set(me.id, inputHash, run.id, DEDUPE_TTL_SEC);
    } catch (err) {
      console.warn('[agent] dedupe.set failed', errorMessage(err));
    }

    try {
      const started = await startPipeline(run.id);
      if (started.mode === 'upstash') await store.updateRun(run.id, { workflowRunId: started.workflowRunId });
    } catch (err) {
      const queueMissing = err instanceof QueueNotConfiguredError;
      console.error('[agent] could not start pipeline', run.id, errorMessage(err));
      const code = queueMissing ? QUEUE_NOT_CONFIGURED_CODE : 'pipeline_unavailable';
      const messageTh = queueMissing ? QUEUE_NOT_CONFIGURED_TH : 'เริ่มการวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
      await store.updateRun(run.id, { status: 'failed', errorMessageTh: messageTh, completedAt: new Date().toISOString() });
      await dedupe.del(me.id, inputHash).catch(() => undefined);
      throw new ApiFailure(503, code, messageTh);
    }

    const body: CreateRunResponse = { runId: run.id, status: run.status, claimSecret, deduped: false };
    return c.json(body, 202);
  });

  r.get('/runs/:id', edge, user, async (c) => {
    const run = await loadOwnedRun(c.req.param('id'), currentUser(c));
    c.header('cache-control', 'no-store');
    return c.json(statusBody(run));
  });

  r.get('/runs/:id/events', edge, user, async (c) => {
    const run = await loadOwnedRun(c.req.param('id'), currentUser(c));
    const after = Math.max(0, parseSeq(c.req.query('after'), 0));
    const events = await getAgentStore().listProgress(run.id, after);
    // nextSeq = the last seq delivered; pass it back as `after` to continue without duplicates.
    const body: RunEventsResponse = { events, nextSeq: events.at(-1)?.seq ?? after };
    c.header('cache-control', 'no-store');
    return c.json(body);
  });

  r.get('/runs/:id/stream', edge, user, async (c) => {
    const run = await loadOwnedRun(c.req.param('id'), currentUser(c));
    const startIndex = parseSeq(c.req.query('startIndex'), Number.NaN);
    // seq starts at 1; startIndex = first seq wanted, after = last seq already seen.
    let after = Math.max(0, Number.isNaN(startIndex) ? parseSeq(c.req.query('after'), 0) : startIndex - 1);
    c.header('cache-control', 'no-cache, no-transform');
    c.header('x-accel-buffering', 'no');

    return streamSSE(c, async (stream) => {
      const store = getAgentStore();
      const deadline = Date.now() + STREAM_MAX_MS;
      while (!stream.aborted && Date.now() < deadline) {
        const events = await store.listProgress(run.id, after);
        for (const e of events) {
          await stream.writeSSE({ id: String(e.seq), event: 'progress', data: JSON.stringify(e) });
          after = e.seq;
        }
        const latest = await store.getRun(run.id);
        if (!latest || (isTerminalStatus(latest.status) && events.length === 0)) break;
        await stream.sleep(STREAM_POLL_MS);
      }
      // Clients reconnect with startIndex = nextSeq + 1 when the run is not finished yet.
      await stream.writeSSE({ event: 'end', data: JSON.stringify({ nextSeq: after }) });
    });
  });

  r.post('/runs/:id/cancel', edge, user, async (c) => {
    const run = await loadOwnedRun(c.req.param('id'), currentUser(c));
    if (run.status === 'cancelled') return c.body(null, 204);
    if (isTerminalStatus(run.status)) {
      throw new ApiFailure(409, 'run_already_finished', 'การวิเคราะห์นี้เสร็จสิ้นแล้ว จึงยกเลิกไม่ได้');
    }
    const store = getAgentStore();
    await store.updateRun(run.id, { status: 'cancelled', completedAt: new Date().toISOString() });
    await store.appendProgress(run.id, {
      stage: run.stage ?? 'intake',
      status: 'failed',
      pct: run.progressPct,
      messageTh: 'ยกเลิกการวิเคราะห์แล้ว',
    });
    if (run.workflowRunId) {
      try {
        await cancelWorkflowRun(run.workflowRunId);
      } catch (err) {
        // Steps also stop on their own once they see the cancelled status.
        console.warn('[agent] workflow cancel failed', run.workflowRunId, errorMessage(err));
      }
    }
    try {
      await dedupe.del(run.ownerId, run.inputHash);
    } catch (err) {
      console.warn('[agent] dedupe.del failed', errorMessage(err));
    }
    return c.body(null, 204);
  });

  return r;
}
