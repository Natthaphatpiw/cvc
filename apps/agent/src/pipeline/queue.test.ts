import { afterEach, describe, expect, it, vi } from 'vitest';
import { queueRunState, runIdFromWorkflowRunId, runnerMode, workflowClient, workflowRunIdFor } from './queue';

const KEYS = ['QSTASH_TOKEN', 'QSTASH_URL', 'QSTASH_CURRENT_SIGNING_KEY', 'QSTASH_NEXT_SIGNING_KEY', 'PIPELINE_RUNNER', 'NODE_ENV'];

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) vi.stubEnv(k, values[k] ?? '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runnerMode', () => {
  it('uses the queue in production only when the token and both signing keys are set', () => {
    setEnv({ NODE_ENV: 'production', QSTASH_TOKEN: 't' });
    expect(runnerMode()).toBe('unavailable');
    setEnv({ NODE_ENV: 'production', QSTASH_TOKEN: 't', QSTASH_CURRENT_SIGNING_KEY: 'a' });
    expect(runnerMode()).toBe('unavailable');
    setEnv({ NODE_ENV: 'production', QSTASH_TOKEN: 't', QSTASH_CURRENT_SIGNING_KEY: 'a', QSTASH_NEXT_SIGNING_KEY: 'b' });
    expect(runnerMode()).toBe('upstash');
  });

  it('never runs inline in production', () => {
    setEnv({ NODE_ENV: 'production' });
    expect(runnerMode()).toBe('unavailable');
    setEnv({ NODE_ENV: 'production', PIPELINE_RUNNER: 'inline' });
    expect(runnerMode()).toBe('unavailable');
  });

  it('falls back to inline locally without QStash and uses the queue with a token', () => {
    setEnv({ NODE_ENV: 'development' });
    expect(runnerMode()).toBe('inline');
    setEnv({ NODE_ENV: 'development', QSTASH_TOKEN: 't' });
    expect(runnerMode()).toBe('upstash');
    setEnv({ NODE_ENV: 'development', PIPELINE_RUNNER: 'upstash' });
    expect(runnerMode()).toBe('unavailable');
  });
});

describe('workflowClient', () => {
  it('never hands the SDK an empty base URL when QSTASH_URL is blank', async () => {
    setEnv({ QSTASH_TOKEN: 't', QSTASH_URL: '' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ runs: [], cursor: '' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await workflowClient().logs({ count: 1 });
      const url = String((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0] ?? '');
      expect(url.startsWith('https://qstash.upstash.io/')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('workflow run ids', () => {
  it('round-trips the agent run id through the SDK prefix', () => {
    const runId = '11111111-2222-4333-8444-555555555555';
    expect(runIdFromWorkflowRunId(`wfr_${workflowRunIdFor(runId)}`)).toBe(runId);
    expect(runIdFromWorkflowRunId('wfr_other')).toBeNull();
  });

  it('reports unknown without a token instead of guessing', async () => {
    setEnv({});
    expect(await queueRunState('wfr_kol-match-x')).toBe('unknown');
  });
});
