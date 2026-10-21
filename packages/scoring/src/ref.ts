import type { Category, KpiBenchmark, MinMax, Objective, RateCard, RefData, Tier, TierBand, TierBenchmark } from '@cvc/schemas';

export function tierFor(followers: number | null, bands: TierBand[]): Tier | null {
  if (followers === null || !Number.isFinite(followers)) return null;
  for (const b of bands) {
    if (followers >= b.minFollowers && (b.maxFollowers === null || followers <= b.maxFollowers)) return b.tier;
  }
  return null;
}

/** 'beauty.skincare' → 'beauty' (via the category table, else the dotted prefix). */
export function parentCategoryId(categoryId: string, categories: readonly Category[]): string | null {
  const row = categories.find((c) => c.id === categoryId);
  if (row) return row.parentId;
  const dot = categoryId.lastIndexOf('.');
  return dot > 0 ? categoryId.slice(0, dot) : null;
}

/** The category row itself, else its parent row (sub-categories missing from ref fall back to the parent). */
export function findCategory(categoryId: string | null, categories: readonly Category[]): Category | null {
  if (!categoryId) return null;
  const own = categories.find((c) => c.id === categoryId);
  if (own) return own;
  const parent = parentCategoryId(categoryId, categories);
  return parent ? (categories.find((c) => c.id === parent) ?? null) : null;
}

/** Tier benchmark for a metric: category-specific (or its parent) first, then the generic row. */
export function tierBenchmark(
  ref: RefData,
  tier: Tier | null,
  metric: TierBenchmark['metric'],
  categoryId: string | null = null,
): TierBenchmark | null {
  if (!tier) return null;
  const rows = ref.tierBenchmarks.filter((b) => b.tier === tier && b.metric === metric);
  if (categoryId) {
    const exact = rows.find((b) => b.categoryId === categoryId);
    if (exact) return exact;
    const parent = parentCategoryId(categoryId, ref.categories);
    const viaParent = parent ? rows.find((b) => b.categoryId === parent) : undefined;
    if (viaParent) return viaParent;
  }
  return rows.find((b) => b.categoryId === null) ?? null;
}

/**
 * Most specific KPI benchmark row: objective+category+tier beats objective alone beats the null row.
 * A row only qualifies when each of its non-null keys matches.
 */
export function kpiBenchmark(
  ref: RefData,
  metric: KpiBenchmark['metric'],
  q: { objective: Objective | null; categoryId: string | null; tier: Tier | null },
): KpiBenchmark | null {
  const parent = q.categoryId ? parentCategoryId(q.categoryId, ref.categories) : null;
  let best: KpiBenchmark | null = null;
  let bestScore = -1;
  for (const row of ref.kpiBenchmarks) {
    if (row.metric !== metric) continue;
    let score = 0;
    if (row.objective !== null) {
      if (row.objective !== q.objective) continue;
      score += 4;
    }
    if (row.categoryId !== null) {
      if (row.categoryId === q.categoryId) score += 2;
      else if (parent !== null && row.categoryId === parent) score += 1;
      else continue;
    }
    if (row.tier !== null) {
      if (row.tier !== q.tier) continue;
      score += 1;
    }
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

const roundTo500 = (x: number): number => Math.round(x / 500) * 500;

function pickRateCard(tier: Tier, categoryId: string | null, ref: RefData, format: RateCard['format']): RateCard | null {
  const cards = ref.rateCards.filter((r) => r.tier === tier && r.format === format);
  if (cards.length === 0) return null;
  const parent = categoryId ? parentCategoryId(categoryId, ref.categories) : null;
  const specificity = (r: RateCard): number => {
    if (r.categoryId === null) return 1;
    if (r.categoryId === categoryId) return 3;
    if (parent !== null && r.categoryId === parent) return 2;
    return 0; // card for an unrelated category
  };
  let best: RateCard | null = null;
  let bestScore = 0;
  for (const r of cards) {
    const spec = specificity(r);
    if (spec === 0) continue;
    const score = (r.source === 'cvc_internal' ? 10 : 0) + spec;
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Rate card for the tier (cvc_internal first, then category-specific, then generic) × niche multiplier of the
 * category (or its parent), rounded to the nearest 500 THB. The multiplier is only applied to generic cards: a
 * category-specific card already prices the niche. Unknown tier / no card → { min: 0, max: 0 } (treated as unknown).
 */
export function estimateFee(tier: Tier | null, categoryId: string | null, ref: RefData, format: RateCard['format'] = 'in_feed'): MinMax {
  if (!tier) return { min: 0, max: 0 };
  const card = pickRateCard(tier, categoryId, ref, format) ?? (format !== 'in_feed' ? pickRateCard(tier, categoryId, ref, 'in_feed') : null);
  if (!card) return { min: 0, max: 0 };
  const multiplier = card.categoryId === null ? (findCategory(categoryId, ref.categories)?.nicheMultiplier ?? 1) : 1;
  const min = roundTo500(card.feeMinTHB * multiplier);
  const max = roundTo500(card.feeMaxTHB * multiplier);
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export const feeMid = (fee: MinMax): number => (fee.min + fee.max) / 2;
export const hasFee = (fee: MinMax): boolean => fee.max > 0;

/** THB per view at the fee midpoint, 2 decimals (22,500 / 62,000 → 0.36). */
export function estCpv(fee: MinMax, medianViews: number | null): number | null {
  if (!hasFee(fee) || medianViews === null || !(medianViews > 0)) return null;
  return Math.round((feeMid(fee) / medianViews) * 100) / 100;
}

/** Benchmark sources actually used, deduplicated in first-use order. */
export function uniqueSources(xs: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const x of xs) if (x && !out.includes(x)) out.push(x);
  return out;
}
