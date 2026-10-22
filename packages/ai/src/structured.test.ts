import { KolEvaluation, PERSONAS_SEED, REF_SEED } from '@cvc/schemas';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBaseBrief } from './stages/normalize';
import { buildStubBrandProfile } from './stubs/brand';
import { dossier, runInput, setStubEnv } from './test/fixtures';

const mocks = vi.hoisted(() => ({ model: null as unknown }));

vi.mock('./models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./models')>();
  return { ...actual, languageModel: () => ({ id: 'gpt-6.1-sol', model: mocks.model }) };
});

const { evaluateCreator } = await import('./index');

const usage = { inputTokens: { total: 1000, noCache: 800, cacheRead: 200, cacheWrite: undefined }, outputTokens: { total: 300, text: 200, reasoning: 100 } };
const result = (json: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(json) }],
  finishReason: { unified: 'stop' as const, raw: 'completed' },
  usage,
  warnings: [],
});

const rubric = (ids: string[]) => [
  { criterion: 'audience_fit', score: 2, evidenceVideoIds: ids, noteTh: 'ผู้ชมตรงกลุ่ม' },
  { criterion: 'content_product_relevance', score: 2, evidenceVideoIds: ['v1'], noteTh: 'ทำคอนเทนต์สกินแคร์' },
  { criterion: 'persuasion', score: 1, evidenceVideoIds: ['v2'], noteTh: 'แนะนำสินค้า' },
  { criterion: 'credibility', score: 2, evidenceVideoIds: ['v3'], noteTh: 'ข้อมูลจริงจัง' },
  { criterion: 'format_execution', score: 7, evidenceVideoIds: [], noteTh: 'ใช้ได้' },
];
const evaluation = (ids: string[]) => ({ rubric: rubric(ids), suitabilityTier: 'low', categoryTags: ['beauty.skincare'], toneTags: ['จริงใจ'], possibleMinor: false, rationaleTh: 'เหมาะกับแบรนด์' });

beforeEach(() => {
  setStubEnv();
  process.env.OPENAI_API_KEY = 'sk-test-not-used';
});
afterEach(() => {
  process.env.OPENAI_API_KEY = '';
});

describe('generateStructured via evaluateCreator (mock model)', () => {
  it('sends strict JSON schema, no temperature, provider options; repairs invalid video ids once', async () => {
    const model = new MockLanguageModelV4({ doGenerate: [result(evaluation(['v999'])), result(evaluation(['v1']))] });
    mocks.model = model;
    const onUsage = vi.fn();
    const brand = buildStubBrandProfile({ brief: buildBaseBrief(runInput()), evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false });

    const e = await evaluateCreator(brand, dossier(), { onUsage });

    expect(KolEvaluation.safeParse(e).success).toBe(true);
    expect(model.doGenerateCalls).toHaveLength(2);
    const first = model.doGenerateCalls[0];
    expect(first?.temperature).toBeUndefined();
    expect(first?.responseFormat).toMatchObject({ type: 'json', name: 'llm2b_evaluate' });
    const schema = (first?.responseFormat as { schema?: { additionalProperties?: boolean; required?: string[] } }).schema;
    expect(schema?.additionalProperties).toBe(false);
    expect(schema?.required).toEqual(expect.arrayContaining(['rubric', 'suitabilityTier', 'possibleMinor']));
    expect(first?.providerOptions?.openai).toMatchObject({ reasoningEffort: 'low', store: false, promptCacheKey: expect.stringMatching(/^llm2b_evaluate-/) });

    const repairPrompt = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(repairPrompt).toContain('v999 are not ids from the video list');

    expect(e.rubric.find((r) => r.criterion === 'audience_fit')?.evidenceVideoIds).toEqual(['v1']);
    expect(e.rubric.find((r) => r.criterion === 'format_execution')?.score).toBe(2);
    expect(e.creatorId).toBe('creator-0001');
    expect(onUsage).toHaveBeenCalledTimes(2);
    const u = onUsage.mock.calls[0]?.[0] as { model: string; inputTokens: number; outputTokens: number; costUsd: number };
    expect(u).toMatchObject({ model: 'gpt-6.1-sol', inputTokens: 1000, outputTokens: 300 });
    // 800 × $2 + 200 × $0.10 + 300 × $10 per 1M tokens
    expect(u.costUsd).toBeCloseTo(0.00462, 6);
  });

  it('drops ids that are still invalid after the repair instead of failing', async () => {
    mocks.model = new MockLanguageModelV4({ doGenerate: [result(evaluation(['bad'])), result(evaluation(['bad']))] });
    const brand = buildStubBrandProfile({ brief: buildBaseBrief(runInput()), evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false });
    const e = await evaluateCreator(brand, dossier());
    expect(e.rubric.find((r) => r.criterion === 'audience_fit')?.evidenceVideoIds).toEqual([]);
  });

  it('repairs half an emoji in provider text before the request (the API rejects it as invalid JSON)', async () => {
    const model = new MockLanguageModelV4({ doGenerate: [result(evaluation(['v1']))] });
    mocks.model = model;
    const brand = buildStubBrandProfile({ brief: buildBaseBrief(runInput()), evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false });
    const d = dossier();
    d.profile.bio = 'รีวิวสกินแคร์ 😍\uD83D';
    await evaluateCreator(brand, d);
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('รีวิวสกินแคร์ 😍\uFFFD');
    expect(prompt).not.toMatch(/\\ud83d/i);
  });
});
