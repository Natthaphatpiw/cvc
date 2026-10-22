// Stored rows are re-parsed on every read (results, brand profiles) and old drafts are re-submitted, so the fields
// added for the brand overview, the inferred campaign and the creator fit summary must all have defaults.
import { BrandProfile, CuratorOutput, FinalResult, InputBrief, PERSONAS_SEED, REF_SEED, RunInput } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { buildBaseBrief } from './stages/normalize';
import { buildStubBrandProfile } from './stubs/brand';
import { buildStubCuratorOutput } from './stubs/curate';
import { dossier, finalResult, hints, kpis, ranked, runInput } from './test/fixtures';

type Json = Record<string, unknown>;
const json = (x: unknown): Json => JSON.parse(JSON.stringify(x)) as Json;
const obj = (x: unknown): Json => x as Json;

describe('rows stored before the new fields still parse', () => {
  it('FinalResult without overviewTh, brief sources and fitSummaryTh', () => {
    const old = json(finalResult());
    delete obj(old.brand).overviewTh;
    for (const k of ['objectiveSource', 'objectiveReasonTh', 'nCreatorsSource', 'audienceSource']) delete obj(old.brief)[k];
    for (const r of old.recommendations as Json[]) delete r.fitSummaryTh;
    const r = FinalResult.parse(old);
    expect(r.brand.overviewTh).toBe('');
    expect(r.brief).toMatchObject({ objectiveSource: 'user', objectiveReasonTh: '', nCreatorsSource: 'user', audienceSource: 'user' });
    expect(r.recommendations.every((x) => x.fitSummaryTh === '')).toBe(true);
  });

  it('BrandProfile without overviewTh and campaign sources', () => {
    const brief = buildBaseBrief(runInput());
    const old = json(buildStubBrandProfile({ brief, evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false }));
    delete old.overviewTh;
    for (const k of ['objectiveSource', 'objectiveReasonTh', 'nCreatorsSource']) delete obj(old.campaign)[k];
    const p = BrandProfile.parse(old);
    expect(p.overviewTh).toBe('');
    expect(p.campaign).toMatchObject({ objectiveSource: 'user', objectiveReasonTh: '', nCreatorsSource: 'user' });
  });

  it('CuratorOutput and InputBrief without the new fields', () => {
    const brief = buildBaseBrief(runInput());
    const brand = buildStubBrandProfile({ brief, evidence: [], personas: PERSONAS_SEED, categories: REF_SEED.categories, allowWebSearch: false });
    const curator = json(buildStubCuratorOutput({ brand, dossier: dossier(), ranked: ranked(), evaluation: null, hints, kpis: kpis() }));
    delete curator.fitSummaryTh;
    expect(CuratorOutput.parse(curator).fitSummaryTh).toBe('');
    const oldBrief = json(brief);
    delete obj(oldBrief.campaign).objectiveSource;
    delete obj(oldBrief.campaign).nCreatorsSource;
    expect(InputBrief.parse(oldBrief).campaign).toMatchObject({ objectiveSource: 'user', nCreatorsSource: 'user' });
  });

  it('RunInput keeps the old defaults and accepts campaign values left to the agent', () => {
    const base = { companyName: 'ซันนี่สกิน', noticeVersion: '2026-10-21' };
    expect(RunInput.parse(base).campaign).toEqual({ objective: 'conversion', budgetTHB: null, nCreators: 5, preferredTiers: [] });
    expect(RunInput.parse({ ...base, campaign: {} }).campaign).toMatchObject({ objective: 'conversion', nCreators: 5 });
    expect(RunInput.parse({ ...base, campaign: { objective: null, nCreators: null } }).campaign).toMatchObject({ objective: null, nCreators: null });
  });
});
