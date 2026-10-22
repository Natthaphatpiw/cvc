import { BrandProfile, PERSONAS_SEED, REF_SEED } from '@cvc/schemas';
import { zodSchema } from 'ai';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  LlmAudienceAssist,
  LlmBrandProfile,
  LlmBrief,
  LlmCampaignAssist,
  LlmCuratorOutput,
  LlmEvaluation,
  LlmEvidenceCard,
  LlmInjectionScreen,
  LlmPortfolioNarrative,
  LlmQueryPlan,
} from './llm-schemas';
import { mapLlmBrandProfile } from './stages/brand';
import { buildBaseBrief } from './stages/normalize';
import { runInput } from './test/fixtures';

type Json = { [k: string]: unknown };
const UNSUPPORTED = ['default', 'propertyNames', 'prefixItems', 'patternProperties', 'oneOf', 'allOf', 'not', 'if', 'then', 'else', 'const'];

/** OpenAI strict mode: objects close additionalProperties and require every property; no unsupported keywords. */
function strictViolations(schema: Json, path = '$'): string[] {
  const out: string[] = [];
  for (const k of UNSUPPORTED) if (k in schema) out.push(`${path}: uses ${k}`);
  if (schema.type === 'object') {
    const props = (schema.properties ?? {}) as Record<string, Json>;
    if (schema.additionalProperties !== false) out.push(`${path}: additionalProperties is not false`);
    const required = new Set((schema.required ?? []) as string[]);
    for (const key of Object.keys(props)) if (!required.has(key)) out.push(`${path}.${key}: not required`);
    for (const [key, sub] of Object.entries(props)) out.push(...strictViolations(sub, `${path}.${key}`));
  }
  if (schema.items && typeof schema.items === 'object') out.push(...strictViolations(schema.items as Json, `${path}[]`));
  if (Array.isArray(schema.anyOf)) (schema.anyOf as Json[]).forEach((s, i) => out.push(...strictViolations(s, `${path}|${i}`)));
  return out;
}

const SCHEMAS: [string, z.ZodType][] = [
  ['LlmBrief', LlmBrief],
  ['LlmEvidenceCard', LlmEvidenceCard],
  ['LlmBrandProfile', LlmBrandProfile],
  ['LlmQueryPlan', LlmQueryPlan],
  ['LlmInjectionScreen', LlmInjectionScreen],
  ['LlmEvaluation', LlmEvaluation],
  ['LlmCuratorOutput', LlmCuratorOutput],
  ['LlmPortfolioNarrative', LlmPortfolioNarrative],
  ['LlmAudienceAssist', LlmAudienceAssist],
  ['LlmCampaignAssist', LlmCampaignAssist],
];

describe('LLM schemas are OpenAI strict-mode compatible', () => {
  it.each(SCHEMAS)('%s', async (_name, schema) => {
    const json = (await zodSchema(schema).jsonSchema) as Json;
    expect(json.type).toBe('object');
    expect(json.anyOf).toBeUndefined();
    expect(strictViolations(json)).toEqual([]);
  });
});

function rawBrand(): z.infer<typeof LlmBrandProfile> {
  return {
    brand: {
      industryId: 'not-a-category',
      subCategories: ['sunscreen'],
      products: [{ name: 'กันแดด', categoryId: 'beauty.skincare', priceBandTHB: { min: 390, max: 290 }, keyBenefits: ['บางเบา'], usp: null }],
      pricePositioning: 'masstige',
      personality: { toneKeywords: ['เป็นกันเอง'], formality: 3, humor: 0.5, energy: -1 },
      languageStyle: { primary: 'th', englishMix: true, register: 'casual' },
      contentPillars: [],
      visualStyle: [],
      regulatedCategory: 'cosmetics',
    },
    audience: {
      segments: [
        {
          label: 'สาวทำงาน',
          ageDist: [
            { key: '25-34', share: 60 },
            { key: '18-24', share: 40 },
          ],
          genderDist: [
            { key: 'Female', share: 0.8 },
            { key: 'male', share: 0.2 },
          ],
          regionDist: [],
          interests: [],
          painPoints: [],
          purchaseDrivers: [],
        },
      ],
      source: 'mixed',
      confidence: 0.7,
    },
    contentStyle: { formats: [], hooks: [], themes: [], fbEngagement: { medianER: null, postsPerWeek: null } },
    overviewTh: `  ${'ซันนี่สกินขายกันแดดสำหรับผิวแพ้ง่าย '.repeat(40)}`,
    campaignSuggestion: { objective: 'awareness', nCreators: 12, reasonTh: 'แบรนด์ยังใหม่ในตลาด จึงควรเริ่มจากการสร้างการรับรู้' },
    campaign: { kpis: ['orders'], formats: ['live'] },
    creatorRequirements: {
      mustCategories: ['beauty.skincare', 'made.up'],
      niceCategories: [],
      desiredTone: [],
      personaArchetypes: [],
      followers: { min: 1, max: 10 },
      minMedianViews: null,
      languages: ['th'],
      dialects: [],
      excludeKeywords: [],
      excludeHandles: ['@Other'],
      competitorBrands: ['คู่แข่งบี'],
      exclusivityWindowDays: 900,
      brandSafetyLevel: 'strict',
    },
    matchingQueries: {
      criteria: [
        { textTh: 'รีวิวสกินแคร์', textEn: 'skincare reviews', weight: 2 },
        { textTh: 'ขายผ่านไลฟ์', textEn: 'live selling', weight: 2 },
      ],
      seedHashtags: ['#รีวิวกันแดด'],
      keywordsTh: ['รีวิวกันแดด'],
      keywordsEn: ['sunscreen review'],
    },
    evidence: [
      { ref: 'E9', claim: 'no such card', url: null },
      { ref: 'W1', claim: 'from search', url: 'https://news.example/a' },
    ],
    sourcesUnavailable: [],
    unknowns: [],
    confidence: 1.4,
  };
}

describe('mapLlmBrandProfile', () => {
  it('maps distributions, validates category ids and keeps code-owned fields', () => {
    const brief = buildBaseBrief(runInput({ campaign: { objective: 'tiktok_shop', budgetTHB: { min: 100_000, max: 200_000 }, nCreators: 4, preferredTiers: ['micro'] } }));
    const p = mapLlmBrandProfile(rawBrand(), { brief, evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: true });
    expect(BrandProfile.safeParse(p).success).toBe(true);
    expect(p.brand.industryId).toBe('beauty.skincare');
    expect(p.brand.products[0]?.priceBandTHB).toBeNull();
    expect(p.brand.personality).toMatchObject({ formality: 1, energy: 0 });
    expect(p.audience.segments[0]?.ageDist).toEqual({ '25-34': 0.6, '18-24': 0.4 });
    expect(p.audience.segments[0]?.genderDist).toEqual({ female: 0.8, male: 0.2 });
    expect(p.creatorRequirements.mustCategories).toEqual(['beauty.skincare']);
    expect(p.creatorRequirements.followers).toEqual({ min: 10_000, max: 99_999 });
    expect(p.creatorRequirements.exclusivityWindowDays).toBe(365);
    expect(p.creatorRequirements.excludeHandles).toEqual(['blocked_one', 'other']);
    expect(p.creatorRequirements.allowMinors).toBe(false);
    // The client set objective and creator count, so LLM1's suggestion (awareness, 12) is not applied.
    expect(p.campaign).toMatchObject({
      objective: 'tiktok_shop',
      objectiveSource: 'user',
      objectiveReasonTh: '',
      nCreators: 4,
      nCreatorsSource: 'user',
      budgetTHB: { min: 100_000, max: 200_000 },
    });
    expect(p.scoringPreset).toBe('tiktok_shop');
    expect(p.overviewTh.startsWith('ซันนี่สกินขายกันแดด')).toBe(true);
    expect(p.overviewTh.length).toBeLessThanOrEqual(900);
    expect(p.matchingQueries.criteria.map((c) => [c.id, c.weight])).toEqual([
      ['c1', 0.5],
      ['c2', 0.5],
    ]);
    expect(p.matchingQueries.seedHashtags).toEqual(['รีวิวกันแดด']);
    expect(p.evidence.map((e) => e.ref)).toEqual(['W1']);
    expect(p.confidence).toBe(1);
  });
});

// Campaign values the client left to the agent (spec B): only those take LLM1's campaignSuggestion.
describe('mapLlmBrandProfile campaign suggestion', () => {
  const map = (campaign: { objective: 'conversion' | null; nCreators: number | null }) =>
    mapLlmBrandProfile(rawBrand(), {
      brief: buildBaseBrief(runInput({ campaign: { ...campaign, budgetTHB: null, preferredTiers: [] } })),
      evidence: [],
      personas: PERSONAS_SEED,
      categories: REF_SEED.categories,
      allowWebSearch: false,
    });

  it('applies the suggested objective and a clamped creator count when both were left empty', () => {
    const p = map({ objective: null, nCreators: null });
    expect(BrandProfile.safeParse(p).success).toBe(true);
    expect(p.campaign).toMatchObject({
      objective: 'awareness',
      objectiveSource: 'inferred',
      objectiveReasonTh: 'แบรนด์ยังใหม่ในตลาด จึงควรเริ่มจากการสร้างการรับรู้',
      nCreators: 10,
      nCreatorsSource: 'inferred',
    });
    expect(p.scoringPreset).toBe('awareness');
  });

  it('keeps an explicit conversion objective and only fills the creator count', () => {
    const p = map({ objective: 'conversion', nCreators: null });
    expect(p.campaign).toMatchObject({ objective: 'conversion', objectiveSource: 'user', objectiveReasonTh: '', nCreators: 10, nCreatorsSource: 'inferred' });
    expect(p.scoringPreset).toBe('conversion');
  });

  it('keeps an explicit creator count and only fills the objective', () => {
    const p = map({ objective: null, nCreators: 5 });
    expect(p.campaign).toMatchObject({ objective: 'awareness', objectiveSource: 'inferred', nCreators: 5, nCreatorsSource: 'user' });
  });
});
