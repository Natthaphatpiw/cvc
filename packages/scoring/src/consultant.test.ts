import { REF_SEED, type ExpectedKpis, type RankedCreator } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { baseNextActions, creatorNextActions } from './actions';
import { computeExpectedKpis } from './kpis';
import { playbookHints, postingWindow } from './playbook';
import { buildPortfolioPlan, type PortfolioItem } from './portfolio';
import { dossier, metrics, video } from './test-fixtures';

const EMOJI = /\p{Extended_Pictographic}/u;

function rankedFor(id: string, over: { reach?: number; er?: number; authenticity?: number; style?: number } = {}): RankedCreator {
  return {
    creatorId: id,
    handle: `creator_${id}`,
    rank: 1,
    total: 80,
    groups: { fit: 0.8, audience: 0.8, performance: 0.8, trust: 0.8, cost: 0.8 },
    sub: {
      fit: { semantic: 0.8, category: 1, relevance: 1, style: over.style ?? 0.5 },
      audience: { demo: 0.6, lang_region: 0.9, interest: 1 },
      performance: { er: over.er ?? 0.5, reach: over.reach ?? 0.5, consistency: 0.7, growth: null, sponsored_perf: null },
      trust: { authenticity: over.authenticity ?? 0.9, saturation: 1, suitability: 1 },
      cost: { cpv: 0.6 },
    },
    missingFeatures: ['growth', 'sponsored_perf'],
    rankStability: 0.9,
    pairwiseAdjusted: false,
    dataConfidence: 0.7,
    gateFailures: [],
    suspectedInjection: false,
  };
}

describe('playbookHints', () => {
  it('makes TikTok Shop sellers live sellers on a hybrid deal', () => {
    const d = dossier('s', { tier: 'mid' });
    d.profile = { ...d.profile, isShopSeller: true };
    const h = playbookHints({ dossier: d, ranked: rankedFor('s'), objective: 'tiktok_shop' });
    expect(h.role).toBe('live_seller');
    expect(h.recommendedFormats).toContain('live');
    expect(h.collaborationModel).toBe('hybrid');
  });

  it('pays small commerce creators by commission for conversion objectives', () => {
    const d = dossier('c', { tier: 'micro' });
    d.profile = { ...d.profile, isCommerceUser: true };
    const h = playbookHints({ dossier: d, ranked: rankedFor('c'), objective: 'conversion' });
    expect(h.role).toBe('conversion_driver');
    expect(h.collaborationModel).toBe('affiliate_commission');
  });

  it('casts mid+ creators with strong reach as hero awareness on a fixed fee', () => {
    const h = playbookHints({ dossier: dossier('h', { tier: 'macro' }), ranked: rankedFor('h', { reach: 0.8 }), objective: 'awareness' });
    expect(h.role).toBe('hero_awareness');
    expect(h.collaborationModel).toBe('fixed_fee');
  });

  it('casts credible high-ER creators as community trust', () => {
    const h = playbookHints({ dossier: dossier('t', { tier: 'micro' }), ranked: rankedFor('t', { er: 0.8, authenticity: 0.9, style: 0.8 }), objective: 'brand_building' });
    expect(h.role).toBe('community_trust');
  });

  it('gifts nano creators for UGC', () => {
    const h = playbookHints({ dossier: dossier('n', { tier: 'nano' }), ranked: rankedFor('n'), objective: 'ugc' });
    expect(h.role).toBe('ugc_content');
    expect(h.collaborationModel).toBe('gifting');
  });

  it('returns a posting window only with enough dated clips', () => {
    expect(postingWindow(metrics({ videosAnalyzed: 5, bestDays: [2], bestHours: [19] }))).toBeNull();
    expect(postingWindow(metrics({ bestDays: [], bestHours: [] }))).toBeNull();
    const w = postingWindow(metrics({ videosAnalyzed: 12, bestDays: [2, 4], bestHours: [19] }));
    expect(w?.bestDays).toEqual([2, 4]);
    expect(w?.basisTh).toContain('12 คลิป');
  });
});

function item(id: string, fee: { min: number; max: number }, objective: 'awareness' | 'conversion' = 'awareness'): PortfolioItem {
  const kpis: ExpectedKpis = computeExpectedKpis({
    metrics: metrics({ medianViews: 50_000, medianViewsOrganic: 50_000, sponsoredCount: 0 }),
    tier: 'micro',
    fee,
    objective,
    categoryId: null,
    ref: REF_SEED,
  });
  return { creatorId: id, handle: `creator_${id}`, fee, kpis, role: objective === 'conversion' ? 'conversion_driver' : 'hero_awareness' };
}

describe('buildPortfolioPlan', () => {
  const items = [item('a', { min: 10_000, max: 20_000 }), item('b', { min: 20_000, max: 40_000 })];

  it('sums totals per percentile', () => {
    const plan = buildPortfolioPlan({ objective: 'awareness', budgetTHB: null, items });
    const [a, b] = items as [PortfolioItem, PortfolioItem];
    expect(plan.totals.feeTHB).toEqual({ min: 30_000, max: 60_000 });
    expect(plan.totals.views).toEqual({
      p25: a.kpis.perPost.views.p25 + b.kpis.perPost.views.p25,
      p50: a.kpis.perPost.views.p50 + b.kpis.perPost.views.p50,
      p75: a.kpis.perPost.views.p75 + b.kpis.perPost.views.p75,
    });
    expect(plan.totals.clicks).toBeNull();
    expect(plan.totals.orders).toBeNull();
    expect(plan.selectedCreatorIds).toEqual(['a', 'b']);
    expect(plan.mixTh).toContain('ประมาณอย่างง่าย');
    expect(plan.timeline.map((t) => t.titleTh)).toEqual(['ติดต่อและยืนยัน', 'brief และสัญญา', 'ผลิตและอนุมัติคอนเทนต์', 'เผยแพร่และวัดผล']);
    expect(plan.measurementPlanTh.some((s) => s.includes('Spark Ads'))).toBe(true);
    expect(plan.measurementPlanTh.some((s) => s.includes('analysis.campaign_outcomes'))).toBe(true);
  });

  it('computes budget fit', () => {
    expect(buildPortfolioPlan({ objective: 'awareness', budgetTHB: null, items }).budgetFit).toBe('no_budget');
    expect(buildPortfolioPlan({ objective: 'awareness', budgetTHB: { min: 10_000, max: 25_000 }, items }).budgetFit).toBe('over');
    expect(buildPortfolioPlan({ objective: 'awareness', budgetTHB: { min: 150_000, max: 200_000 }, items }).budgetFit).toBe('under');
    // fee max 60,000 is not below 0.6 × 100,000
    const within = buildPortfolioPlan({ objective: 'awareness', budgetTHB: { min: 100_000, max: 120_000 }, items });
    expect(within.budgetFit).toBe('within');
    expect(within.budgetAllocation[0]?.shareOfBudget).toBeCloseTo(15_000 / 120_000, 3);
    expect(buildPortfolioPlan({ objective: 'awareness', budgetTHB: null, items }).budgetAllocation[0]?.shareOfBudget).toBeNull();
  });

  it('judges a fee range that straddles the budget by its midpoint', () => {
    // fee total 30,000–60,000, midpoint 45,000
    const over = buildPortfolioPlan({ objective: 'awareness', budgetTHB: { min: 30_000, max: 40_000 }, items });
    expect(over.budgetFit).toBe('over');
    const straddle = buildPortfolioPlan({ objective: 'awareness', budgetTHB: { min: 40_000, max: 50_000 }, items });
    expect(straddle.budgetFit).toBe('within');
    expect(straddle.budgetFitTh).toContain('ช่วงบนเกินงบ');
    // shares use the same reference (budget max) as the fit, so a 'within' plan stays at or below 100%
    const shares = straddle.budgetAllocation.map((a) => a.shareOfBudget ?? 0);
    expect(shares).toEqual([0.3, 0.6]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1);
  });

  it('adds click and order totals for conversion plans', () => {
    const conv = [item('a', { min: 10_000, max: 20_000 }, 'conversion'), item('b', { min: 20_000, max: 40_000 }, 'conversion')];
    const plan = buildPortfolioPlan({ objective: 'conversion', budgetTHB: { min: 50_000, max: 80_000 }, items: conv });
    expect(plan.totals.clicks?.p50).toBe((conv[0]?.kpis.conversion?.clicks.p50 ?? 0) + (conv[1]?.kpis.conversion?.clicks.p50 ?? 0));
    expect(plan.measurementPlanTh[0]).toContain('UTM');
  });
});

describe('next actions', () => {
  it('creates stable campaign and outreach actions', () => {
    const actions = baseNextActions({ objective: 'conversion', creators: [{ creatorId: 'c1', handle: 'creator_one' }] });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('outreach-c1');
    expect(ids).toContain('tracking-utm');
    expect(new Set(ids).size).toBe(ids.length);
    expect(actions.find((a) => a.id === 'outreach-c1')).toMatchObject({ owner: 'planner', category: 'outreach', creatorId: 'c1' });
    for (let i = 1; i < actions.length; i += 1) expect(actions[i]!.dueInDays).toBeGreaterThanOrEqual(actions[i - 1]!.dueInDays);
    expect(baseNextActions({ objective: 'conversion', creators: [{ creatorId: 'c1', handle: 'creator_one' }] })).toEqual(actions);
  });

  it('derives per-creator actions from the playbook', () => {
    const d = dossier('c2', { tier: 'mid' });
    d.profile = { ...d.profile, isShopSeller: true };
    d.videos = d.videos.map((v) => video({ ...v, hasShopProduct: true }));
    const hints = playbookHints({ dossier: d, ranked: rankedFor('c2'), objective: 'tiktok_shop' });
    const actions = creatorNextActions({ creatorId: 'c2', handle: 'creator_two', playbook: { ...hints, postingWindow: { bestDays: [2], bestHours: [19], basisTh: '' } }, objective: 'tiktok_shop' });
    const ids = actions.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['brief-c2', 'commission-c2', 'affiliate-link-c2', 'live-c2', 'post-c2', 'report-c2']));
    expect(actions.every((a) => a.creatorId === 'c2')).toBe(true);
    expect(actions.find((a) => a.id === 'post-c2')?.detailTh).toBe('ช่วงที่แนะนำ: วันพุธ ช่วง 19:00–20:00 น.');
  });

  it('never emits emoji in Thai templates', () => {
    const plan = buildPortfolioPlan({ objective: 'tiktok_shop', budgetTHB: { min: 1, max: 2 }, items: [item('a', { min: 10_000, max: 20_000 }, 'conversion')] });
    const actions = [
      ...baseNextActions({ objective: 'ugc', creators: [{ creatorId: 'x', handle: 'x' }] }),
      ...creatorNextActions({ creatorId: 'x', handle: 'x', playbook: { role: 'ugc_content', recommendedFormats: ['in_feed', 'spark_ads'], collaborationModel: 'gifting', postingWindow: null }, objective: 'ugc' }),
    ];
    const text = JSON.stringify({ plan, actions, kpis: item('k', { min: 1_000, max: 2_000 }, 'conversion').kpis });
    expect(EMOJI.test(text)).toBe(false);
  });
});

describe('hourRangesTh', () => {
  it('merges contiguous hours and wraps midnight', async () => {
    const { hourRangesTh } = await import('./playbook');
    expect(hourRangesTh([20, 18, 19, 22])).toEqual(['18:00–21:00 น.', '22:00–23:00 น.']);
    expect(hourRangesTh([23, 0, 1])).toEqual(['23:00–02:00 น.']);
    expect(hourRangesTh([])).toEqual([]);
  });
});
