import { Client } from '@upstash/workflow';
import { envFlag, envString } from '../env';

// Every reader is a function so Next can build without secrets (env is read at request time).

/** Path of the Upstash Workflow endpoint (app/api/workflow/kol-match/route.ts); QStash calls it directly. */
export const KOL_MATCH_WORKFLOW_PATH = '/api/workflow/kol-match';
export const KOL_MATCH_FLOW_CONTROL_KEY = 'cvc-kol-match';
export const KOL_MATCH_LABEL = 'kol-match';
export const VERCEL_BYPASS_HEADER = 'x-vercel-protection-bypass';
const WORKFLOW_RUN_ID_PREFIX = 'kol-match-';
/** client.trigger prefixes the given workflowRunId with this (see Client.trigger in @upstash/workflow). */
const SDK_RUN_ID_PREFIX = 'wfr_';
const DEFAULT_MAX_PARALLEL_RUNS = 3;
const LOCAL_WORKFLOW_URL = 'http://localhost:3002';
/** Same default as @upstash/qstash. Always passed explicitly: the SDK falls back with `??`, so a blank `QSTASH_URL=` in
 * the environment would otherwise win and every call would fail with "Invalid URL". */
const DEFAULT_QSTASH_URL = 'https://qstash.upstash.io';

function qstashBaseUrl(): string {
  return stripTrailingSlash(envString('QSTASH_URL') || DEFAULT_QSTASH_URL);
}

export const QUEUE_NOT_CONFIGURED_CODE = 'queue_not_configured';
export const QUEUE_NOT_CONFIGURED_TH = 'ระบบคิวงานยังไม่ได้ตั้งค่า (QStash) จึงยังเริ่มการวิเคราะห์ไม่ได้';

export type RunnerSetting = 'auto' | 'upstash' | 'inline';
export type RunnerMode = 'upstash' | 'inline' | 'unavailable';

export function runnerSetting(): RunnerSetting {
  const v = envString('PIPELINE_RUNNER').toLowerCase();
  return v === 'upstash' || v === 'inline' ? v : 'auto';
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** QStash can be called (trigger / cancel). */
export function isQStashTokenConfigured(): boolean {
  return envFlag('QSTASH_TOKEN');
}

export function isQStashSigningConfigured(): boolean {
  return envFlag('QSTASH_CURRENT_SIGNING_KEY') && envFlag('QSTASH_NEXT_SIGNING_KEY');
}

/** Health flag: the queue can both start runs and verify QStash's calls to the workflow endpoint. */
export function isQueueConfigured(): boolean {
  return isQStashTokenConfigured() && isQStashSigningConfigured();
}

/**
 * Which runner starts new pipelines. The inline runner (after() in the request) is local/demo only: in production it
 * would hit the function timeout, so production without a working queue is 'unavailable'. In production the queue also
 * needs both signing keys: the workflow endpoint refuses unsigned calls there, so a token alone would accept runs that
 * never start.
 */
export function runnerMode(): RunnerMode {
  const setting = runnerSetting();
  const queueReady = isProduction() ? isQueueConfigured() : isQStashTokenConfigured();
  if (setting === 'upstash') return queueReady ? 'upstash' : 'unavailable';
  if (setting === 'inline') return isProduction() ? 'unavailable' : 'inline';
  if (queueReady) return 'upstash';
  return isProduction() ? 'unavailable' : 'inline';
}

/** QStash parallelism for the flow-control key shared by all KOL-match runs. */
export function maxParallelRuns(): number {
  const n = Number.parseInt(envString('PIPELINE_MAX_PARALLEL_RUNS'), 10);
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_MAX_PARALLEL_RUNS;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Public origin of cvc-agent that QStash calls. UPSTASH_WORKFLOW_URL wins; on Vercel it falls back to the production
 * domain (production) or the deployment URL (preview); locally to the agent dev server.
 */
export function workflowBaseUrl(): string | null {
  const explicit = envString('UPSTASH_WORKFLOW_URL');
  if (explicit) return stripTrailingSlash(explicit);
  if (envFlag('VERCEL')) {
    const host = envString('VERCEL_ENV') === 'production' ? envString('VERCEL_PROJECT_PRODUCTION_URL') : envString('VERCEL_URL');
    return host ? `https://${stripTrailingSlash(host)}` : null;
  }
  return isProduction() ? null : LOCAL_WORKFLOW_URL;
}

export function kolMatchWorkflowUrl(): string {
  const base = workflowBaseUrl();
  if (!base) throw new Error('UPSTASH_WORKFLOW_URL is not set and cannot be derived');
  return `${base}${KOL_MATCH_WORKFLOW_PATH}`;
}

/** Deployment Protection bypass for QStash's calls into a protected (preview) deployment. */
export function vercelBypassHeaders(): Record<string, string> | undefined {
  const secret = envString('VERCEL_AUTOMATION_BYPASS_SECRET');
  return secret ? { [VERCEL_BYPASS_HEADER]: secret } : undefined;
}

/**
 * Environment handed to the Upstash SDK in place of process.env: blank QSTASH_* values (e.g. `QSTASH_URL=` in .env)
 * are dropped so the SDK falls back to its defaults instead of using an empty base URL, and UPSTASH_WORKFLOW_URL is
 * the same derived origin the trigger uses.
 */
export function upstashEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of ['QSTASH_TOKEN', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY']) {
    env[key] = envString(key) || undefined;
  }
  env.QSTASH_URL = qstashBaseUrl();
  env.UPSTASH_WORKFLOW_URL = workflowBaseUrl() ?? undefined;
  return env;
}

export function workflowClient(): Client {
  return new Client({ token: envString('QSTASH_TOKEN'), baseUrl: qstashBaseUrl() });
}

/** Stable workflow run id for an agent run (passed to client.trigger, which adds the `wfr_` prefix). */
export function workflowRunIdFor(runId: string): string {
  return `${WORKFLOW_RUN_ID_PREFIX}${runId}`;
}

/** Inverse of the trigger's run id, for the failure function when the initial payload is unavailable. */
export function runIdFromWorkflowRunId(workflowRunId: string): string | null {
  const prefix = `${SDK_RUN_ID_PREFIX}${WORKFLOW_RUN_ID_PREFIX}`;
  return workflowRunId.startsWith(prefix) ? workflowRunId.slice(prefix.length) || null : null;
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const status = (err as { status?: unknown }).status;
  if (status === 404) return true;
  const message = err instanceof Error ? err.message : '';
  return /not\s*found/i.test(message);
}

/**
 * Cancels a queued or running workflow run in QStash. Runs QStash no longer knows (finished, or started by the old
 * runtime) are ignored; steps also stop on their own once they see the run's terminal status.
 */
export async function cancelWorkflowRun(workflowRunId: string): Promise<void> {
  if (!isQStashTokenConfigured() || !workflowRunId.startsWith(SDK_RUN_ID_PREFIX)) return;
  try {
    await workflowClient().cancel(workflowRunId);
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
}

export type QueueRunState = 'active' | 'ended' | 'unknown';

/**
 * Asks QStash whether a workflow run is still in progress (waiting behind flow control or between steps counts as
 * active). 'unknown' when QStash cannot be asked or does not know the run.
 */
export async function queueRunState(workflowRunId: string): Promise<QueueRunState> {
  if (!isQStashTokenConfigured() || !workflowRunId.startsWith(SDK_RUN_ID_PREFIX)) return 'unknown';
  try {
    const { runs } = await workflowClient().logs({ filter: { workflowRunId }, count: 1 });
    const run = runs[0];
    if (!run) return 'unknown';
    return run.workflowState === 'RUN_STARTED' ? 'active' : 'ended';
  } catch {
    return 'unknown';
  }
}
