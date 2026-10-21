import type { GroupWeights, Objective, ScoreGroup, SubScores, Tier } from '@cvc/schemas';

/** §6.5 preset table (group weights W_g, Σ = 1). */
export const PRESETS: Record<Objective, GroupWeights> = {
  awareness: { fit: 0.3, audience: 0.25, performance: 0.3, trust: 0.1, cost: 0.05 },
  launch: { fit: 0.3, audience: 0.25, performance: 0.3, trust: 0.1, cost: 0.05 },
  conversion: { fit: 0.35, audience: 0.25, performance: 0.2, trust: 0.1, cost: 0.1 },
  tiktok_shop: { fit: 0.35, audience: 0.25, performance: 0.2, trust: 0.1, cost: 0.1 },
  brand_building: { fit: 0.45, audience: 0.25, performance: 0.15, trust: 0.15, cost: 0 },
  ugc: { fit: 0.4, audience: 0.15, performance: 0.15, trust: 0.1, cost: 0.2 },
};

export type InnerWeights = { readonly [G in ScoreGroup]: { readonly [K in keyof SubScores[G]]: number } };

/** §6.5 inner weights w_gi (Σ = 1 per group). */
export const INNER_WEIGHTS: InnerWeights = {
  fit: { semantic: 0.3, category: 0.15, relevance: 0.25, style: 0.3 },
  audience: { demo: 0.5, lang_region: 0.25, interest: 0.25 },
  performance: { er: 0.4, reach: 0.28, consistency: 0.16, growth: 0.08, sponsored_perf: 0.08 },
  trust: { authenticity: 0.6, saturation: 0.2, suitability: 0.2 },
  cost: { cpv: 1 },
};

export const GROUPS: readonly ScoreGroup[] = ['fit', 'audience', 'performance', 'trust', 'cost'];

/** Demographic estimates below this confidence hand their weight to lang_region + interest (§6.4). */
export const DEMO_CONFIDENCE_MIN = 0.3;

/** Shrinkage strength for ER* = (n·ER + k·ER_ref)/(n+k). */
export const ER_SHRINK_K = 8;

/** Pool size below which er / median_views percentiles fall back to ref.tierBenchmarks. */
export const MIN_POOL_FOR_PERCENTILE = 5;

/**
 * Pool size from which the authenticity ER-outlier check uses a pool z-score (|z| > 2.5). Below it an SD from a few
 * values is too unstable (honest high-ER creators get flagged), so smaller pools compare against the tier benchmark.
 */
export const MIN_POOL_FOR_ER_Z = 9;

export const SMALL_TIERS: readonly Tier[] = ['nano', 'micro'];

export const TIER_LABEL_TH: Record<Tier, string> = {
  nano: 'นาโน',
  micro: 'ไมโคร',
  mid: 'มิดเทียร์',
  macro: 'มาโคร',
  mega: 'เมกะ',
};

/** Normalizes group weights to Σ = 1 (all-zero input falls back to equal weights). */
export function normalizeWeights(w: GroupWeights): GroupWeights {
  const vals = GROUPS.map((g) => Math.max(0, w[g]));
  const s = vals.reduce((a, b) => a + b, 0);
  if (s <= 0) return { fit: 0.2, audience: 0.2, performance: 0.2, trust: 0.2, cost: 0.2 };
  return {
    fit: Math.max(0, w.fit) / s,
    audience: Math.max(0, w.audience) / s,
    performance: Math.max(0, w.performance) / s,
    trust: Math.max(0, w.trust) / s,
    cost: Math.max(0, w.cost) / s,
  };
}
