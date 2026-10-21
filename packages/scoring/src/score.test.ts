import { REF_SEED, type SubScores } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { INNER_WEIGHTS, PRESETS } from './presets';
import { estCpv } from './ref';
import {
  aggregateGroups,
  demoScore,
  effectiveDemographicWeight,
  poolMedianScores,
  rescore,
  scoreCandidates,
  totalScore,
  type ScoringContext,
} from './score';
import { round } from './stats';
import { candidate } from './test-fixtures';

// SYSTEM_DESIGN §4.7 worked example.
const EXAMPLE: SubScores = {
  fit: { semantic: 0.9, category: 0.85, relevance: 1.0, style: 0.9 },
  audience: { demo: 0.7, lang_region: 0.95, interest: 1.0 },
  performance: { er: 0.82, reach: 0.8, consistency: 0.75, growth: null, sponsored_perf: 0.7 },
  trust: { authenticity: 0.9, saturation: 0.85, suitability: 1.0 },
  cost: { cpv: 0.72 },
};

describe('SYSTEM_DESIGN §4.7 worked example', () => {
  it('reproduces group scores, total and CPV', () => {
    const agg = aggregateGroups(EXAMPLE, { demoConfidence: 0.5 });
    expect(agg.groups.fit).toBeCloseTo(0.9175, 10);
    expect(agg.groups.audience).toBeCloseTo(0.8375, 10);
    expect(agg.groups.performance).toBeCloseTo(0.7913, 4);
    expect(agg.groups.trust).toBeCloseTo(0.91, 10);
    expect(agg.groups.cost).toBeCloseTo(0.72, 10);
    expect(agg.missing).toEqual(['growth']);

    const groups = {
      fit: agg.groups.fit ?? 0,
      audience: agg.groups.audience ?? 0,
      performance: agg.groups.performance ?? 0,
      trust: agg.groups.trust ?? 0,
      cost: agg.groups.cost ?? 0,
    };
    const total = totalScore(groups, PRESETS.conversion);
    expect(round(total, 1)).toBe(85.2);
    expect(Math.round(total)).toBe(85);

    expect(estCpv({ min: 15_000, max: 30_000 }, 62_000)).toBe(0.36);
  });

  it('uses the §6.5 presets and inner weights', () => {
    expect(PRESETS.conversion).toEqual({ fit: 0.35, audience: 0.25, performance: 0.2, trust: 0.1, cost: 0.1 });
    expect(PRESETS.brand_building.cost).toBe(0);
    for (const g of Object.values(INNER_WEIGHTS)) {
      expect(Object.values(g as Record<string, number>).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    }
  });

  it('moves the demo weight to lang_region + interest when demo confidence is low', () => {
    const agg = aggregateGroups(EXAMPLE, { demoConfidence: 0.2 });
    expect(agg.groups.audience).toBeCloseTo(0.5 * 0.95 + 0.5 * 1.0, 10);
    expect(agg.demoInnerWeight).toBe(0);
  });
});

describe('demoScore', () => {
  it('is 1·c̄ + (1 − c̄)·0.5 for identical distributions and null without data', () => {
    const brand = { ageDist: { '18-24': 0.6, '25-34': 0.4 }, genderDist: { female: 0.8, male: 0.2 } };
    const audience = {
      source: 'heuristic_comments' as const,
      countryDist: null,
      ageDist: { '18–24': 60, '25-34': 40 },
      genderDist: { F: 0.8, M: 0.2 },
      regionDist: null,
      thaiShare: 0.9,
      sampleSize: 40,
      ci95: null,
      confidence: 'medium' as const,
      commentSignals: null,
    };
    expect(demoScore(brand, audience)).toBeCloseTo(1 * 0.5 + 0.5 * 0.5, 10);
    expect(demoScore(null, audience)).toBeNull();
    expect(demoScore(brand, null)).toBeNull();
    expect(demoScore(brand, { ...audience, ageDist: null, genderDist: null })).toBeNull();
  });
});

const ctx = (over: Partial<ScoringContext> = {}): ScoringContext => ({
  weights: PRESETS.conversion,
  objective: 'conversion',
  brandCategories: ['beauty.skincare'],
  brandAudience: { ageDist: { '18-24': 0.5, '25-34': 0.5 }, genderDist: { female: 0.8, male: 0.2 } },
  brandSafetyLevel: 'standard',
  ref: REF_SEED,
  ...over,
});

function pool() {
  return [
    candidate('a', { semantic: 0.8, scores: { content_product_relevance: 2, persuasion: 2, credibility: 2, format_execution: 2, audience_fit: 2 }, metrics: { medianViews: 90_000, erViewsMedian: 0.08 } }),
    candidate('b', { semantic: 0.6, metrics: { medianViews: 40_000, erViewsMedian: 0.05 } }),
    candidate('c', { semantic: 0.4, metrics: { medianViews: 20_000, erViewsMedian: 0.03 }, fee: { min: 1_500, max: 5_000 } }),
    candidate('d', { semantic: 0.7, metrics: { medianViews: 60_000, erViewsMedian: 0.06 } }),
    candidate('e', { semantic: 0.3, metrics: { medianViews: 10_000, erViewsMedian: 0.02 }, scores: { content_product_relevance: 0, persuasion: 0, credibility: 0, format_execution: 0, audience_fit: 0 } }),
    candidate('f', { semantic: 0.5, metrics: { medianViews: 30_000, erViewsMedian: 0.04 } }),
    candidate('x', { semantic: 0.99, gateFailures: ['fee_over_budget'] }),
  ];
}

describe('scoreCandidates', () => {
  it('ranks passing candidates by total, deterministically', () => {
    const ranked = scoreCandidates(pool(), ctx());
    expect(ranked.map((r) => r.creatorId)).not.toContain('x');
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    for (let i = 1; i < ranked.length; i += 1) expect(ranked[i - 1]!.total).toBeGreaterThanOrEqual(ranked[i]!.total);
    expect(ranked[0]?.creatorId).toBe('a');
    expect(ranked.at(-1)?.creatorId).toBe('e');
    for (const r of ranked) {
      expect(r.rankStability).not.toBeNull();
      expect(r.rankStability).toBeGreaterThanOrEqual(0);
      expect(r.rankStability).toBeLessThanOrEqual(1);
      expect(r.missingFeatures).toContain('growth');
      expect(r.dataConfidence).toBeGreaterThan(0);
      expect(r.dataConfidence).toBeLessThanOrEqual(1);
    }
    expect(scoreCandidates(pool(), ctx())).toEqual(ranked);
  });

  it('pins LLM-derived sub-scores of suspected injections to the pool median', () => {
    const p = pool();
    p[4] = { ...p[4]!, suspectedInjection: true };
    const ranked = scoreCandidates(p, ctx());
    const e = ranked.find((r) => r.creatorId === 'e')!;
    const others = ranked.filter((r) => r.creatorId !== 'e');
    const med = (xs: number[]) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
    };
    expect(e.suspectedInjection).toBe(true);
    expect(e.sub.fit.relevance).toBeCloseTo(med(others.map((r) => r.sub.fit.relevance!)), 4);
    expect(e.sub.audience.interest).toBeCloseTo(med(others.map((r) => r.sub.audience.interest!)), 4);
  });

  it('falls back to tier benchmarks for small pools', () => {
    const ranked = scoreCandidates([candidate('solo', { metrics: { medianViews: 40_000, erViewsMedian: 0.065 } })], ctx());
    expect(ranked).toHaveLength(1);
    // micro median_views p75 = 40,000 → 0.75; ER shrunk toward micro p50 lies between p50 and p75.
    expect(ranked[0]!.sub.performance.reach).not.toBe(0.5);
    expect(ranked[0]!.sub.performance.er).toBeGreaterThan(0.5);
    expect(ranked[0]!.sub.performance.er).toBeLessThan(0.75);
    expect(ranked[0]!.rankStability).toBe(1);
  });

  it('applies the small-tier quota with a greedy swap', () => {
    const big = (id: string, s: number) => candidate(id, { semantic: s, dossier: { tier: 'mid', followers: 300_000 }, metrics: { medianViews: 200_000 } });
    const small = (id: string, s: number) => candidate(id, { semantic: s, dossier: { tier: 'micro', followers: 50_000 }, metrics: { medianViews: 10_000 } });
    const p = [big('m1', 0.9), big('m2', 0.85), big('m3', 0.8), big('m4', 0.75), big('m5', 0.7), small('s1', 0.2), small('s2', 0.1)];
    const without = scoreCandidates(p, ctx());
    expect(without.slice(0, 5).map((r) => r.creatorId).sort()).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    const withQuota = scoreCandidates(p, ctx({ tierQuota: { smallShareMin: 0.3 } }));
    const top5 = withQuota.slice(0, 5).map((r) => r.creatorId);
    expect(top5.filter((id) => id.startsWith('s'))).toHaveLength(2);
    expect(withQuota.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('does not flag an ordinary high-ER creator in a small pool', () => {
    const ers = [0.045, 0.048, 0.05, 0.052, 0.075];
    const p = ers.map((er, i) => candidate(`m${i}`, { semantic: 0.5, metrics: { medianViews: 20_000, erViewsMedian: er } }));
    for (const r of scoreCandidates(p, ctx())) expect(r.sub.trust.authenticity).toBe(1);
  });

  it('flags an ER far above the tier benchmark in a small pool', () => {
    const p = pool();
    p[5] = candidate('f', { semantic: 0.5, metrics: { medianViews: 30_000, erViewsMedian: 0.4 } });
    const ranked = scoreCandidates(p, ctx());
    expect(ranked).toHaveLength(6);
    expect(ranked.find((r) => r.creatorId === 'f')?.sub.trust.authenticity).toBe(0.75);
    for (const r of ranked.filter((x) => x.creatorId !== 'f')) expect(r.sub.trust.authenticity).toBe(1);
  });

  it('reports the effective demographic weight', () => {
    const p = pool();
    expect(effectiveDemographicWeight(p, ctx())).toBeCloseTo(0.25 * 0.5, 3);
    const low = p.map((c) => ({ ...c, dossier: { ...c.dossier, audience: c.dossier.audience && { ...c.dossier.audience, confidence: 'low' as const } } }));
    expect(effectiveDemographicWeight(low, ctx())).toBe(0);
  });
});

describe('rescore', () => {
  it('re-weights existing group scores and re-ranks without new data', () => {
    const ranked = scoreCandidates(pool(), ctx());
    const costOnly = rescore(ranked, { fit: 0, audience: 0, performance: 0, trust: 0, cost: 1 });
    const cheapest = [...ranked].sort((a, b) => b.groups.cost - a.groups.cost)[0]!;
    expect(costOnly[0]?.creatorId).toBe(cheapest.creatorId);
    expect(costOnly[0]?.total).toBeCloseTo(100 * cheapest.groups.cost, 1);
    expect(costOnly.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(costOnly.find((r) => r.creatorId === 'a')?.groups).toEqual(ranked.find((r) => r.creatorId === 'a')?.groups);

    const same = rescore(ranked, PRESETS.conversion);
    expect(same.map((r) => r.creatorId)).toEqual(ranked.map((r) => r.creatorId));
    expect(same.map((r) => r.total)).toEqual(ranked.map((r) => r.total));
  });

  it('reproduces the rank stability of scoreCandidates when given the same seed', () => {
    const big = [...pool(), ...pool().map((c, i) => candidate(`z${i}`, { semantic: (c.semantic ?? 0.5) - 0.05, metrics: c.dossier.metrics }))];
    const seeded = scoreCandidates(big, ctx({ seed: 7 }));
    expect(rescore(seeded, PRESETS.conversion, 7).map((r) => r.rankStability)).toEqual(seeded.map((r) => r.rankStability));
    const unseeded = scoreCandidates(big, ctx());
    expect(rescore(unseeded, PRESETS.conversion).map((r) => r.rankStability)).toEqual(unseeded.map((r) => r.rankStability));
    expect(rescore(seeded, PRESETS.conversion).map((r) => r.rankStability)).not.toEqual(seeded.map((r) => r.rankStability));
  });

  it('normalizes weights that do not sum to 1', () => {
    const ranked = scoreCandidates(pool(), ctx());
    const doubled = rescore(ranked, { fit: 0.7, audience: 0.5, performance: 0.4, trust: 0.2, cost: 0.2 });
    expect(doubled.map((r) => r.total)).toEqual(ranked.map((r) => r.total));
  });
});

describe('poolMedianScores', () => {
  it('returns group medians on the 0–100 scale', () => {
    const ranked = scoreCandidates(pool(), ctx());
    const med = poolMedianScores(ranked);
    for (const v of Object.values(med)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});
