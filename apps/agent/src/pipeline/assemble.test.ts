import { buildBaseBrief, researchBrand } from '@cvc/ai';
import { FinalResult, PERSONAS_SEED, REF_SEED, RunInput, type BrandProfile, type PortfolioPlan } from '@cvc/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFinalResult } from './assemble';
import { brandOneLinerTh } from './text';

const plan: PortfolioPlan = {
  selectedCreatorIds: [],
  budgetAllocation: [],
  totals: { feeTHB: { min: 0, max: 0 }, views: { p25: 0, p50: 0, p75: 0 }, engagements: { p25: 0, p50: 0, p75: 0 }, clicks: null, orders: null },
  budgetFit: 'no_budget',
  budgetFitTh: 'ยังไม่ได้ระบุงบประมาณ',
  mixTh: '',
  timeline: [],
  measurementPlanTh: [],
};

function result(brand: BrandProfile, audienceSource: 'user' | 'inferred'): FinalResult {
  return FinalResult.parse(
    buildFinalResult({
      resultId: 'res-1',
      runId: 'run-1',
      version: 1,
      generatedAt: '2026-10-22T00:00:00.000Z',
      isDemo: true,
      isPartial: false,
      brand,
      ref: REF_SEED,
      objective: brand.campaign.objective,
      audienceSource,
      weights: { fit: 0.35, audience: 0.25, performance: 0.2, trust: 0.1, cost: 0.1 },
      budgetTHB: null,
      nCreators: brand.campaign.nCreators,
      recommendations: [],
      alternatives: [],
      plan,
      narrative: null,
      baseActions: [],
      candidatesScanned: 0,
      candidatesEvaluated: 0,
      dataSources: [],
      dataAsOf: '2026-10-22T00:00:00.000Z',
      caveatsTh: [],
      sourceDocs: [],
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('USE_AI_GATEWAY', 'false');
  vi.stubEnv('AI_GATEWAY_API_KEY', '');
  vi.stubEnv('DEMO_MODE', 'auto');
});

describe('buildFinalResult brand overview and brief sources', () => {
  it("uses LLM1's overview and copies what the agent chose onto the brief", async () => {
    const brief = buildBaseBrief(RunInput.parse({ companyName: 'ซันนี่สกิน', noticeVersion: '2026-10-21', campaign: { objective: null } }));
    const brand = await researchBrand({ brief, evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false });
    const r = result(brand, 'inferred');
    expect(r.brand.overviewTh).toBe(brand.overviewTh);
    expect(r.brief).toMatchObject({
      objective: 'awareness',
      objectiveSource: 'inferred',
      objectiveReasonTh: brand.campaign.objectiveReasonTh,
      nCreatorsSource: 'user',
      audienceSource: 'inferred',
    });
  });

  it('falls back to a code overview that says what was inferred', async () => {
    const brief = buildBaseBrief(RunInput.parse({ companyName: 'ซันนี่สกิน', noticeVersion: '2026-10-21', campaign: { objective: null } }));
    const researched = await researchBrand({ brief, evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false });
    const brand = { ...researched, overviewTh: '' };
    const overview = result(brand, 'inferred').brand.overviewTh;
    expect(overview.startsWith(brandOneLinerTh(brand, REF_SEED))).toBe(true);
    expect(overview).toContain('ระบบวิเคราะห์ว่ากลุ่มลูกค้าหลักคือ');
    expect(overview).toContain('ระบบเลือกเป้าหมายแคมเปญ รับรู้แบรนด์ ให้');
  });

  it('reads a brand profile stored before the new fields as client-set', async () => {
    const brief = buildBaseBrief(RunInput.parse({ companyName: 'ซันนี่สกิน', noticeVersion: '2026-10-21', personaIds: ['first_jobber'] }));
    const researched = await researchBrand({ brief, evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false });
    const { overviewTh: _o, ...legacyTop } = researched;
    const { objectiveSource: _s, nCreatorsSource: _n, objectiveReasonTh: _r, ...legacyCampaign } = researched.campaign;
    const r = result({ ...legacyTop, campaign: legacyCampaign } as BrandProfile, 'user');
    expect(r.brief).toMatchObject({ objective: 'conversion', objectiveSource: 'user', objectiveReasonTh: '', nCreatorsSource: 'user', audienceSource: 'user' });
    expect(r.brand.overviewTh).toContain('กลุ่มลูกค้าหลัก: First jobber วัยเริ่มทำงาน');
  });
});
