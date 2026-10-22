import { AiNotConfiguredError, AiOutputError } from '@cvc/ai';
import { AssistResponse, PERSONAS_SEED } from '@cvc/schemas';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleError, type AppEnv } from '../http';
import { assistRoutes } from './assist';

const mocks = vi.hoisted(() => ({ fail: null as Error | null }));

// The real stage (its stub, with no model configured) unless a test makes it fail.
vi.mock('@cvc/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cvc/ai')>();
  return {
    ...actual,
    assistForm: (...args: Parameters<typeof actual.assistForm>) => (mocks.fail ? Promise.reject(mocks.fail) : actual.assistForm(...args)),
  };
});

function app(): Hono<AppEnv> {
  const a = new Hono<AppEnv>().basePath('/api/agent');
  a.route('/', assistRoutes());
  a.onError(handleError);
  return a;
}

function post(body: unknown, guestId: string | null = crypto.randomUUID()): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (guestId) headers['x-cvc-guest-id'] = guestId;
  return Promise.resolve(app().request('/api/agent/assist', { method: 'POST', headers, body: JSON.stringify(body) }));
}

const audience = { section: 'audience', promptTh: 'บริษัทขายอาหารเพื่อสุขภาพ เน้นมื้อเช้า', companyName: 'อรุณสุข ฟู้ดส์' };

beforeEach(() => {
  // Local demo: no edge secret, guest id auth, memory store and rate limits, stubbed AI.
  for (const k of ['EDGE_SHARED_SECRET', 'SUPABASE_URL', 'AGENT_DATABASE_URL', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'OPENAI_API_KEY', 'AI_GATEWAY_API_KEY']) {
    vi.stubEnv(k, '');
  }
  vi.stubEnv('USE_AI_GATEWAY', 'false');
  vi.stubEnv('DEMO_MODE', 'auto');
  mocks.fail = null;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/agent/assist', () => {
  it('fills the audience section with catalog personas', async () => {
    const res = await post(audience);
    expect(res.status).toBe(200);
    const body = AssistResponse.parse(await res.json());
    if (body.section !== 'audience') throw new Error('expected the audience section');
    const catalog = new Set(PERSONAS_SEED.map((p) => p.id));
    expect(body.audience.personaIds.length).toBeGreaterThan(0);
    expect(body.audience.personaIds.every((id) => catalog.has(id))).toBe(true);
  });

  it('fills the campaign section', async () => {
    const res = await post({ section: 'campaign', promptTh: 'เน้นสร้างแบรนด์ งบราว 2 แสน' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ section: 'campaign', campaign: { objective: 'brand_building', budgetTHB: { min: 200_000, max: 200_000 } } });
  });

  it('rejects a bad body and a caller without a session', async () => {
    const bad = await post({ section: 'audience', promptTh: 'ก' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: { code: 'invalid_request' } });
    expect((await post(audience, null)).status).toBe(401);
  });

  it('limits each user to 20 calls an hour', async () => {
    const guestId = crypto.randomUUID();
    for (let i = 0; i < 20; i++) expect((await post(audience, guestId)).status).toBe(200);
    const limited = await post(audience, guestId);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it.each([
    ['AiOutputError', new AiOutputError('assist_audience', ['personaIds: x']), 502, 'assist_failed'],
    ['a provider error', new Error('upstream 500'), 502, 'assist_failed'],
    ['a timeout', new DOMException('The operation was aborted due to timeout', 'TimeoutError'), 504, 'assist_timeout'],
    ['AiNotConfiguredError', new AiNotConfiguredError('assistForm'), 503, 'assist_unavailable'],
  ])('maps %s to a Thai error instead of a 500', async (_name, err, status, code) => {
    mocks.fail = err;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await post(audience);
    expect(res.status).toBe(status);
    const body = (await res.json()) as { error: { code: string; messageTh: string } };
    expect(body.error.code).toBe(code);
    expect(body.error.messageTh).toMatch(/[ก-๙]/);
  });
});
