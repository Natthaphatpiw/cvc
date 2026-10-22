import { AssistRequest, AssistResponse, PERSONAS_SEED } from '@cvc/schemas';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiNotConfiguredError } from './env';
import { moneyMentioned, parseBudgetTh, parseCreatorCount } from './stubs/assist';
import { setStubEnv } from './test/fixtures';

const mocks = vi.hoisted(() => ({ model: null as unknown, tiers: [] as string[] }));

vi.mock('./models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./models')>();
  return {
    ...actual,
    languageModel: (tier: string) => {
      mocks.tiers.push(tier);
      return { id: 'gpt-6-luna', model: mocks.model };
    },
  };
});

const { assistForm } = await import('./index');

const CATALOG = new Set(PERSONAS_SEED.map((p) => p.id));
const HEALTH_FOOD = 'บริษัทขายอาหารเพื่อสุขภาพ เน้นมื้อเช้า';
const BRAND_BUILDING = 'อยากได้แคมเปญที่เหมาะกับสินค้าที่เน้นสร้างแบรนด์ งบราว 2 แสน';

const req = (over: Partial<Parameters<typeof AssistRequest.parse>[0]>) =>
  AssistRequest.parse({ section: 'audience', promptTh: HEALTH_FOOD, companyName: 'อรุณสุข ฟู้ดส์', ...over });

const usage = { inputTokens: { total: 900, noCache: 900, cacheRead: 0, cacheWrite: undefined }, outputTokens: { total: 200, text: 150, reasoning: 50 } };
const result = (json: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(json) }],
  finishReason: { unified: 'stop' as const, raw: 'completed' },
  usage,
  warnings: [],
});

beforeEach(() => {
  setStubEnv();
  mocks.tiers = [];
});

describe('assistForm stub', () => {
  it('picks catalog personas for a health food brand that focuses on breakfast', async () => {
    const out = await assistForm(req({}), PERSONAS_SEED);
    expect(AssistResponse.safeParse(out).success).toBe(true);
    if (out.section !== 'audience') throw new Error('expected the audience section');
    expect(out.audience.personaIds).toEqual(expect.arrayContaining(['foodie', 'fitness_health']));
    expect(out.audience.personaIds.length).toBeLessThanOrEqual(4);
    expect(out.audience.personaIds.every((id) => CATALOG.has(id))).toBe(true);
    expect(out.audience.audienceNotes).toContain('กลุ่มลูกค้าหลักคือ');
    expect(out.audience.audienceNotes).toMatch(/อายุส่วนใหญ่ราว \d+/);
    expect(out.noteTh.length).toBeGreaterThan(0);
  });

  it('keeps the need as notes and returns no ids when nothing in the catalog fits', async () => {
    const out = await assistForm(req({ promptTh: 'ขายอะไหล่เครื่องจักรอุตสาหกรรม' }), PERSONAS_SEED);
    if (out.section !== 'audience') throw new Error('expected the audience section');
    expect(out.audience.personaIds).toEqual([]);
    expect(out.audience.audienceNotes).toContain('ขายอะไหล่เครื่องจักรอุตสาหกรรม');
  });

  it('only returns ids from the catalog it was given', async () => {
    const onlyFoodie = PERSONAS_SEED.filter((p) => p.id === 'foodie');
    const out = await assistForm(req({}), onlyFoodie);
    if (out.section !== 'audience') throw new Error('expected the audience section');
    expect(out.audience.personaIds).toEqual(['foodie']);
  });

  it('reads brand building and "งบ 2 แสน" from the campaign need', async () => {
    const out = await assistForm(req({ section: 'campaign', promptTh: BRAND_BUILDING }), PERSONAS_SEED);
    expect(out).toMatchObject({ section: 'campaign', campaign: { objective: 'brand_building', budgetTHB: { min: 200_000, max: 200_000 }, nCreators: 5 } });
    expect(out.noteTh).toContain('สร้างแบรนด์ระยะยาว');
  });

  it('leaves the budget empty when no money is mentioned and reads the creator count', async () => {
    const out = await assistForm(req({ section: 'campaign', promptTh: 'เน้นขายผ่าน TikTok Shop อยากได้ครีเอเตอร์ 8 คน' }), PERSONAS_SEED);
    expect(out).toMatchObject({ section: 'campaign', campaign: { objective: 'tiktok_shop', budgetTHB: null, nCreators: 8 } });
  });

  it('throws AiNotConfiguredError with DEMO_MODE=off and no key', async () => {
    process.env.DEMO_MODE = 'off';
    await expect(assistForm(req({}), PERSONAS_SEED)).rejects.toBeInstanceOf(AiNotConfiguredError);
  });
});

describe('assist budget and count parsing', () => {
  it.each([
    ['งบราว 2 แสน', { min: 200_000, max: 200_000 }],
    ['งบ 1-2 แสนบาท', { min: 100_000, max: 200_000 }],
    ['ประมาณ 50,000 - 100,000 บาท', { min: 50_000, max: 100_000 }],
    ['งบไม่เกิน 1.5 ล้าน', { min: 1_500_000, max: 1_500_000 }],
    ['budget 200k', { min: 200_000, max: 200_000 }],
    ['อยากได้ยอดวิว 1 ล้าน งบ 5 หมื่น', { min: 50_000, max: 50_000 }],
    ['ลูกค้าผู้หญิงอายุ 25-34 ปี', null],
    ['แคมเปญเปิดตัวสินค้าใหม่ช่วงปลายปี 2026', null],
    ['อยากได้ยอดวิว 1,000,000', null],
    ['ครีเอเตอร์ที่มีผู้ติดตาม 50,000 ขึ้นไป', null],
    ['สินค้าราคา 990 บาท อยากเพิ่มยอดขาย', null],
    ['สินค้าราคา 990 บาท งบ 1 แสน', { min: 100_000, max: 100_000 }],
  ])('%s', (text, expected) => {
    expect(parseBudgetTh(text)).toEqual(expected);
  });

  it('tells money from other numbers', () => {
    expect(moneyMentioned('งบราว 2 แสน')).toBe(true);
    expect(moneyMentioned('ครีเอเตอร์ 5 คน เน้นคนรุ่นใหม่')).toBe(false);
    expect(parseCreatorCount('ครีเอเตอร์ 5 คน')).toBe(5);
    expect(parseCreatorCount('อยากได้ 30 คน')).toBe(10);
    expect(parseCreatorCount('งบ 2 แสน')).toBeNull();
  });
});

describe('assistForm (mock model)', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-test-not-used';
  });
  afterEach(() => {
    process.env.OPENAI_API_KEY = '';
  });

  it('uses the fast tier at low effort with a strict schema, spotlights the need and repairs an unknown persona id', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        result({ personaIds: ['health_nut', 'foodie'], audienceNotes: 'คนทำงานที่อยากกินมื้อเช้าดีต่อสุขภาพ', noteTh: 'เลือกกลุ่มที่ใส่ใจสุขภาพ' }),
        result({ personaIds: ['fitness_health', 'foodie'], audienceNotes: 'คนทำงานอายุ 25-44 ปีที่อยากกินมื้อเช้าดีต่อสุขภาพ', noteTh: 'เลือกกลุ่มที่ใส่ใจสุขภาพ' }),
      ],
    });
    mocks.model = model;
    const onUsage = vi.fn();
    const signal = new AbortController().signal;

    const out = await assistForm(req({}), PERSONAS_SEED, { signal, onUsage });

    expect(out).toEqual({
      section: 'audience',
      audience: { personaIds: ['fitness_health', 'foodie'], audienceNotes: 'คนทำงานอายุ 25-44 ปีที่อยากกินมื้อเช้าดีต่อสุขภาพ' },
      noteTh: 'เลือกกลุ่มที่ใส่ใจสุขภาพ',
    });
    expect(mocks.tiers).toEqual(['fast', 'fast']);
    expect(model.doGenerateCalls).toHaveLength(2);
    const first = model.doGenerateCalls[0];
    expect(first?.maxOutputTokens).toBe(1_200);
    expect(first?.responseFormat).toMatchObject({ type: 'json', name: 'assist_audience' });
    const schema = (first?.responseFormat as { schema?: { additionalProperties?: boolean; required?: string[] } }).schema;
    expect(schema?.additionalProperties).toBe(false);
    expect(schema?.required).toEqual(expect.arrayContaining(['personaIds', 'audienceNotes', 'noteTh']));
    expect(first?.providerOptions?.openai).toMatchObject({ reasoningEffort: 'low', store: false, promptCacheKey: expect.stringMatching(/^assist_audience-/) });
    const prompt = JSON.stringify(first?.prompt);
    expect(prompt).toContain('untrusted_source id=\\"need\\" type=\\"user_need\\"');
    expect(prompt).toContain('fitness_health');
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain('health_nut are not ids from the persona catalog');
    expect(onUsage).toHaveBeenCalledTimes(2);
  });

  it('drops an unknown persona id that survives the repair', async () => {
    const answer = { personaIds: ['health_nut', 'foodie'], audienceNotes: 'คนที่อยากกินมื้อเช้าดีต่อสุขภาพ', noteTh: '' };
    mocks.model = new MockLanguageModelV4({ doGenerate: [result(answer), result(answer)] });
    const out = await assistForm(req({}), PERSONAS_SEED);
    if (out.section !== 'audience') throw new Error('expected the audience section');
    expect(out.audience.personaIds).toEqual(['foodie']);
    expect(out.noteTh.length).toBeGreaterThan(0);
  });

  it('keeps a stated budget in order, clamps the creator count and sends no persona catalog', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [result({ objective: 'brand_building', budgetMinTHB: 300_000, budgetMaxTHB: 200_000, nCreators: 12, noteTh: 'เน้นสร้างแบรนด์' })],
    });
    mocks.model = model;
    const out = await assistForm(req({ section: 'campaign', promptTh: 'เน้นสร้างแบรนด์ งบ 2-3 แสน' }), PERSONAS_SEED);
    expect(out).toEqual({
      section: 'campaign',
      campaign: { objective: 'brand_building', budgetTHB: { min: 200_000, max: 300_000 }, nCreators: 10 },
      noteTh: 'เน้นสร้างแบรนด์',
    });
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0]?.responseFormat).toMatchObject({ name: 'assist_campaign' });
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).not.toContain('Persona catalog');
  });

  it('drops a budget the planner never mentioned and parses one the model missed', async () => {
    mocks.model = new MockLanguageModelV4({
      doGenerate: [result({ objective: 'awareness', budgetMinTHB: 100_000, budgetMaxTHB: 100_000, nCreators: 5, noteTh: 'เน้นการรับรู้' })],
    });
    const guessed = await assistForm(req({ section: 'campaign', promptTh: 'อยากให้คนรู้จักแบรนด์มากขึ้น' }), PERSONAS_SEED);
    expect(guessed.section === 'campaign' && guessed.campaign.budgetTHB).toBeNull();

    mocks.model = new MockLanguageModelV4({
      doGenerate: [result({ objective: 'brand_building', budgetMinTHB: null, budgetMaxTHB: null, nCreators: 5, noteTh: 'เน้นสร้างแบรนด์' })],
    });
    const missed = await assistForm(req({ section: 'campaign', promptTh: BRAND_BUILDING }), PERSONAS_SEED);
    expect(missed.section === 'campaign' && missed.campaign.budgetTHB).toEqual({ min: 200_000, max: 200_000 });
  });
});
