import { buildBaseBrief, researchBrand } from '@cvc/ai';
import { PERSONAS_SEED, REF_SEED, RunInput, type BrandProfile, type InputBrief } from '@cvc/schemas';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUserConstraints, inferredMessageTh, resolvedBrief } from './brand';

function input(over: Record<string, unknown> = {}): RunInput {
  return RunInput.parse({ companyName: 'ซันนี่สกิน', websiteUrl: 'https://www.sunny-skin.example', noticeVersion: '2026-10-21', ...over });
}

/** Stub LLM1 (no model configured) for a brief, as the brand step calls it. */
function research(brief: InputBrief): Promise<BrandProfile> {
  return researchBrand({ brief, evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false });
}

beforeEach(() => {
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('USE_AI_GATEWAY', 'false');
  vi.stubEnv('AI_GATEWAY_API_KEY', '');
  vi.stubEnv('DEMO_MODE', 'auto');
});

describe('brand step campaign resolution', () => {
  it('keeps what the client set and leaves the brief alone', async () => {
    const run = input({ personaIds: ['first_jobber'], campaign: { objective: 'tiktok_shop', nCreators: 3 } });
    const brief = buildBaseBrief(run);
    // A profile whose campaign disagrees with the client: the client's values must win.
    const researched = await research(brief);
    const other: BrandProfile = { ...researched, campaign: { ...researched.campaign, objective: 'awareness', nCreators: 8, objectiveReasonTh: 'x' } };
    const brand = applyUserConstraints(other, run, brief.campaign);
    expect(brand.campaign).toMatchObject({ objective: 'tiktok_shop', objectiveSource: 'user', objectiveReasonTh: '', nCreators: 3, nCreatorsSource: 'user' });
    expect(brand.scoringPreset).toBe('tiktok_shop');
    expect(resolvedBrief(brief, brand)).toBeNull();
    expect(inferredMessageTh(brief, brand)).toBeNull();
  });

  it('takes the suggestion for values left empty and writes them back with the sources kept', async () => {
    const run = input({ campaign: { objective: null, nCreators: null } });
    const brief = buildBaseBrief(run);
    const brand = applyUserConstraints(await research(brief), run, brief.campaign);
    // No products in the evidence: the stub suggests awareness and five creators.
    expect(brand.campaign).toMatchObject({ objective: 'awareness', objectiveSource: 'inferred', nCreators: 5, nCreatorsSource: 'inferred' });
    expect(brand.campaign.objectiveReasonTh.length).toBeGreaterThan(0);
    expect(brand.scoringPreset).toBe('awareness');

    const resolved = resolvedBrief(brief, brand);
    expect(resolved?.campaign).toMatchObject({ objective: 'awareness', objectiveSource: 'inferred', nCreators: 5, nCreatorsSource: 'inferred' });
    expect(resolved?.targetAudience).toEqual(brief.targetAudience);
    expect(inferredMessageTh(brief, brand)).toBe(
      'ระบบวิเคราะห์กลุ่มลูกค้าจากข้อมูลของแบรนด์ให้ · เลือกเป้าหมายแคมเปญให้: รับรู้แบรนด์ · แนะนำจำนวนครีเอเตอร์: 5 คน',
    );
  });

  it('clamps an out-of-range suggested creator count', async () => {
    const run = input({ personaIds: ['first_jobber'], campaign: { nCreators: null } });
    const brief = buildBaseBrief(run);
    const researched = await research(brief);
    const brand = applyUserConstraints({ ...researched, campaign: { ...researched.campaign, nCreators: 40 } }, run, brief.campaign);
    expect(brand.campaign).toMatchObject({ objective: 'conversion', objectiveSource: 'user', nCreators: 10, nCreatorsSource: 'inferred' });
    expect(inferredMessageTh(brief, brand)).toBe('ระบบแนะนำจำนวนครีเอเตอร์: 10 คน');
  });

  it('treats a brief stored before the source fields existed as client-set', async () => {
    const run = input({ campaign: { objective: 'launch', nCreators: 4 } });
    const { objectiveSource: _o, nCreatorsSource: _n, ...legacyCampaign } = buildBaseBrief(run).campaign;
    const legacy = { ...buildBaseBrief(run), campaign: legacyCampaign } as InputBrief;
    const brand = applyUserConstraints(await research(legacy), run, legacy.campaign);
    expect(brand.campaign).toMatchObject({ objective: 'launch', objectiveSource: 'user', nCreators: 4, nCreatorsSource: 'user' });
    expect(resolvedBrief(legacy, brand)).toBeNull();
  });
});
