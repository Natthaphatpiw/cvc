import type {
  AudienceEstimate,
  BrandSafetyLevel,
  Category,
  Confidence,
  CreatorDossier,
  GroupScores,
  GroupWeights,
  KolEvaluation,
  MinMax,
  Objective,
  RankedCreator,
  RefData,
  RubricCriterion,
  ScoreGroup,
  SubScores,
  SuitabilityTier,
  Tier,
} from '@cvc/schemas';
import {
  DEMO_CONFIDENCE_MIN,
  ER_SHRINK_K,
  GROUPS,
  INNER_WEIGHTS,
  MIN_POOL_FOR_ER_Z,
  MIN_POOL_FOR_PERCENTILE,
  SMALL_TIERS,
  normalizeWeights,
} from './presets';
import { estimateFee, feeMid, hasFee, kpiBenchmark, parentCategoryId, tierBenchmark } from './ref';
import {
  clamp01,
  isNum,
  mean,
  median,
  mulberry32,
  pctFromQuartiles,
  pctRank,
  quantile,
  round,
  sampleDirichlet,
  stdev,
} from './stats';

export type EvaluatedCandidate = {
  dossier: CreatorDossier;
  evaluation: KolEvaluation | null;
  /** weighted max cosine against the brand criteria (raw, not yet a percentile) */
  semantic: number | null;
  suspectedInjection: boolean;
  estFeeTHB: MinMax;
  gateFailures: string[];
};

export type ScoringContext = {
  weights: GroupWeights;
  objective: Objective;
  brandCategories: string[];
  brandAudience: { ageDist: Record<string, number> | null; genderDist: Record<string, number> | null } | null;
  brandSafetyLevel: BrandSafetyLevel;
  ref: RefData;
  /** ensure ≥ smallShareMin of the top `topN` (default 5) are nano/micro when such candidates exist */
  tierQuota?: { smallShareMin: number; topN?: number };
  seed?: number;
};

// ---------------------------------------------------------------------------------------------
// Aggregation (§6.4 renormalization, §6.5 weighted total)
// ---------------------------------------------------------------------------------------------

export type GroupAggregation = {
  groups: { [G in ScoreGroup]: number | null };
  /** sub-score names that were null and renormalized away */
  missing: string[];
  /** per group: share of the inner weight backed by data (after the low-confidence demo move) */
  coverage: { [G in ScoreGroup]: number };
  /** effective inner weight of `demo` inside the audience group */
  demoInnerWeight: number;
};

function innerWeightsFor(g: ScoreGroup, demoConfidence: number | null): Record<string, number> {
  const w: Record<string, number> = { ...(INNER_WEIGHTS[g] as Record<string, number>) };
  if (g === 'audience' && demoConfidence !== null && demoConfidence < DEMO_CONFIDENCE_MIN) {
    const demo = w.demo ?? 0;
    const lr = w.lang_region ?? 0;
    const it = w.interest ?? 0;
    const rest = lr + it;
    if (rest > 0) {
      w.lang_region = lr + (demo * lr) / rest;
      w.interest = it + (demo * it) / rest;
      w.demo = 0;
    }
  }
  return w;
}

/**
 * Group scores from sub-scores: w'_gi = w_gi·a_gi / Σ_j w_gj·a_gj inside each group (a = 1 when the sub-score
 * exists). When demo confidence < 0.3 the demo weight moves to lang_region + interest first. A group without any
 * data is null. `unavailable` marks non-null sub-scores that should still count as missing for coverage (pinned).
 */
export function aggregateGroups(sub: SubScores, opts?: { demoConfidence?: number | null; unavailable?: readonly string[] }): GroupAggregation {
  const groups = {} as { [G in ScoreGroup]: number | null };
  const coverage = {} as { [G in ScoreGroup]: number };
  const missing: string[] = [];
  let demoInnerWeight = 0;
  for (const g of GROUPS) {
    const values = sub[g] as Record<string, number | null>;
    const w = innerWeightsFor(g, opts?.demoConfidence ?? null);
    let num = 0;
    let den = 0;
    let covered = 0;
    let total = 0;
    for (const [k, wk] of Object.entries(w)) {
      const v = values[k] ?? null;
      total += wk;
      if (v === null) {
        missing.push(k);
        continue;
      }
      num += wk * v;
      den += wk;
      if (!opts?.unavailable?.includes(k)) covered += wk;
    }
    groups[g] = den > 0 ? num / den : null;
    coverage[g] = total > 0 ? covered / total : 0;
    if (g === 'audience') demoInnerWeight = den > 0 && values.demo !== null && values.demo !== undefined ? (w.demo ?? 0) / den : 0;
  }
  return { groups, missing, coverage, demoInnerWeight };
}

/** 100 × Σ_g W_g · group_g with W normalized to Σ = 1 (unrounded). */
export function totalScore(groups: GroupScores, weights: GroupWeights): number {
  const W = normalizeWeights(weights);
  let s = 0;
  for (const g of GROUPS) s += W[g] * groups[g];
  return 100 * s;
}

// ---------------------------------------------------------------------------------------------
// Individual sub-scores
// ---------------------------------------------------------------------------------------------

const CONFIDENCE_VALUE: Record<Confidence, number> = { low: 0.2, medium: 0.5, high: 0.85 };

/** c̄ of an audience estimate (0 when there is none). */
export function demoConfidence(audience: AudienceEstimate | null): number {
  return audience ? CONFIDENCE_VALUE[audience.confidence] : 0;
}

const GENDER_ALIASES: Record<string, string> = { f: 'female', woman: 'female', women: 'female', หญิง: 'female', m: 'male', man: 'male', men: 'male', ชาย: 'male' };

function normKey(k: string): string {
  const s = k.normalize('NFC').trim().toLowerCase().replace(/[‒-―]/g, '-').replace(/\s+/g, '');
  return GENDER_ALIASES[s] ?? s;
}

function toDist(rec: Record<string, number> | null | undefined): Map<string, number> | null {
  if (!rec) return null;
  const m = new Map<string, number>();
  for (const [k, v] of Object.entries(rec)) {
    if (!isNum(v) || v <= 0) continue;
    const key = normKey(k);
    m.set(key, (m.get(key) ?? 0) + v);
  }
  let s = 0;
  for (const v of m.values()) s += v;
  if (s <= 0) return null;
  for (const [k, v] of m) m.set(k, v / s);
  return m;
}

/** Jensen-Shannon divergence with log base 2, in [0, 1]. */
function jsd(p: Map<string, number>, q: Map<string, number>): number {
  const keys = new Set([...p.keys(), ...q.keys()]);
  let s = 0;
  for (const k of keys) {
    const a = p.get(k) ?? 0;
    const b = q.get(k) ?? 0;
    const m = (a + b) / 2;
    if (a > 0) s += 0.5 * a * Math.log2(a / m);
    if (b > 0) s += 0.5 * b * Math.log2(b / m);
  }
  return clamp01(s);
}

/**
 * §6.3 demo = (Σ_d c_d·(1 − JSD(p_d‖q_d)) / Σ_d c_d)·c̄ + (1 − c̄)·0.5 over the age and gender marginals. The estimate
 * carries one confidence, so c_d = c̄ for every marginal and the weighted mean reduces to a plain mean.
 */
export function demoScore(
  brand: { ageDist: Record<string, number> | null; genderDist: Record<string, number> | null } | null,
  audience: AudienceEstimate | null,
): number | null {
  if (!brand || !audience) return null;
  const sims: number[] = [];
  const pairs: [Record<string, number> | null, Record<string, number> | null][] = [
    [brand.ageDist, audience.ageDist],
    [brand.genderDist, audience.genderDist],
  ];
  for (const [b, a] of pairs) {
    const p = toDist(b);
    const q = toDist(a);
    if (p && q) sims.push(1 - jsd(p, q));
  }
  const m = mean(sims);
  if (m === null) return null;
  const c = demoConfidence(audience);
  return m * c + (1 - c) * 0.5;
}

function categorySim(a: string, b: string, categories: readonly Category[]): number {
  if (a === b) return 1;
  const pa = parentCategoryId(a, categories);
  const pb = parentCategoryId(b, categories);
  if (pa === b || pb === a) return 0.6;
  if (pa !== null && pa === pb) return 0.4;
  return 0;
}

/**
 * Weighted (soft) Jaccard between brand and creator categories, where parent/child matches count 0.6 and siblings
 * 0.4. Blended 70/30 with brand coverage so that creators with several extra tags are not punished too hard.
 */
export function categoryScore(brandCats: readonly string[], creatorCats: readonly string[], categories: readonly Category[]): number | null {
  const B = [...new Set(brandCats)];
  const C = [...new Set(creatorCats)];
  if (B.length === 0 || C.length === 0) return null;
  let matched = 0;
  for (const b of B) matched += Math.max(...C.map((c) => categorySim(b, c, categories)));
  const coverage = matched / B.length;
  const jaccard = matched / (B.length + C.length - matched);
  return clamp01(0.7 * coverage + 0.3 * jaccard);
}

function rubric(e: KolEvaluation | null, c: RubricCriterion): number | null {
  const r = e?.rubric.find((x) => x.criterion === c);
  return r ? r.score / 2 : null;
}

const SUITABILITY_SCORE: Record<BrandSafetyLevel, Record<SuitabilityTier, number>> = {
  strict: { low: 1, medium: 0.25, high: 0 },
  standard: { low: 1, medium: 0.5, high: 0 },
  relaxed: { low: 1, medium: 0.75, high: 0.25 },
};

function langRegion(d: CreatorDossier): number | null {
  if (d.audience && isNum(d.audience.thaiShare)) return clamp01(d.audience.thaiShare);
  const signals: number[] = [];
  if (d.profile.region) signals.push(d.profile.region.trim().toUpperCase() === 'TH' ? 1 : 0);
  const langs = d.videos.filter((v) => v.textLanguage);
  if (langs.length > 0) signals.push(langs.filter((v) => (v.textLanguage ?? '').toLowerCase().startsWith('th')).length / langs.length);
  const locs = d.videos.filter((v) => v.locationCreated);
  if (locs.length > 0) signals.push(locs.filter((v) => (v.locationCreated ?? '').toUpperCase() === 'TH').length / locs.length);
  return mean(signals);
}

// ---------------------------------------------------------------------------------------------
// scoreCandidates (§6.8)
// ---------------------------------------------------------------------------------------------

type Raw = {
  c: EvaluatedCandidate;
  tier: Tier | null;
  semantic: number | null;
  category: number | null;
  relevance: number | null;
  style: number | null;
  demo: number | null;
  demoConf: number;
  langRegion: number | null;
  interest: number | null;
  rawEr: number | null;
  erShrunk: number | null;
  erBench: { p25: number; p50: number; p75: number } | null;
  vpf: number | null;
  medianViews: number | null;
  cv: number | null;
  ppw: number | null;
  growth: number | null;
  sponsoredPerf: number | null;
  saturation: number | null;
  suitability: number | null;
  cpv: number | null;
  commentLike: number | null;
  maxViews: number | null;
};

const LLM_SUBS = ['relevance', 'style', 'interest', 'suitability'] as const;

function raw(c: EvaluatedCandidate, ctx: ScoringContext): Raw {
  const d = c.dossier;
  const m = d.metrics;
  const e = c.evaluation;
  const tier = d.tier;
  const creatorCats = e && e.categoryTags.length > 0 ? e.categoryTags : d.categories;
  const primaryCat = creatorCats[0] ?? null;

  const styleParts = (['persuasion', 'credibility', 'format_execution'] as const).map((k) => rubric(e, k)).filter(isNum);
  const suitTier = e?.suitabilityTier ?? d.suitabilityTier;

  const erBenchRow = tierBenchmark(ctx.ref, tier, 'er_views', primaryCat);
  const erRef = erBenchRow?.p50 ?? kpiBenchmark(ctx.ref, 'er_views', { objective: ctx.objective, categoryId: primaryCat, tier })?.p50 ?? null;
  const n = m.videosAnalyzed;
  const rawEr = m.erViewsMedian;
  const erShrunk = rawEr === null ? null : erRef === null ? rawEr : (n * rawEr + ER_SHRINK_K * erRef) / (n + ER_SHRINK_K);

  const followers = d.profile.followerCount;
  const mv = m.medianViews;
  const sponsoredPerf =
    m.sponsoredCount >= 3 && isNum(m.erSponsored) && isNum(m.erOrganic) && m.erOrganic > 0
      ? Math.min(1.2, m.erSponsored / m.erOrganic) / 1.2
      : null;

  const ratios = d.videos
    .filter((v) => isNum(v.likes) && (v.likes as number) > 0 && isNum(v.comments))
    .map((v) => (v.comments as number) / (v.likes as number));
  const viewsList = d.videos.map((v) => v.views).filter(isNum);

  return {
    c,
    tier,
    semantic: c.semantic,
    category: categoryScore(ctx.brandCategories, creatorCats, ctx.ref.categories),
    relevance: rubric(e, 'content_product_relevance'),
    style: mean(styleParts),
    demo: demoScore(ctx.brandAudience, d.audience),
    demoConf: demoConfidence(d.audience),
    langRegion: langRegion(d),
    interest: rubric(e, 'audience_fit'),
    rawEr,
    erShrunk,
    erBench: erBenchRow,
    vpf: isNum(mv) && isNum(followers) && followers > 0 ? mv / followers : null,
    medianViews: isNum(mv) && mv > 0 ? mv : null,
    cv: m.viewsCv,
    ppw: m.postsPerWeek,
    growth: m.followerGrowth30d,
    sponsoredPerf,
    saturation: isNum(m.sponsoredShare) ? clamp01((0.6 - m.sponsoredShare) / 0.4) : null,
    suitability: suitTier ? SUITABILITY_SCORE[ctx.brandSafetyLevel][suitTier] : null,
    cpv: hasFee(c.estFeeTHB) && isNum(mv) && mv > 0 ? feeMid(c.estFeeTHB) / mv : null,
    commentLike: median(ratios),
    maxViews: viewsList.length > 0 ? Math.max(...viewsList) : null,
  };
}

const nums = (xs: (number | null)[]): number[] => xs.filter(isNum);

/** Pool percentile, or the tier benchmark when the pool is too small to rank against. */
function pctOrBench(x: number, pool: readonly number[], bench: { p25: number; p50: number; p75: number } | null, log: boolean): number {
  if (pool.length >= MIN_POOL_FOR_PERCENTILE || !bench) return pctRank(x, pool);
  return pctFromQuartiles(x, bench, log);
}

function cpvBenchmark(ref: RefData, tier: Tier | null): { p25: number; p50: number; p75: number } | null {
  const direct = tierBenchmark(ref, tier, 'cpv_thb');
  if (direct) return direct;
  const views = tierBenchmark(ref, tier, 'median_views');
  const fee = estimateFee(tier, null, ref);
  if (!views || !hasFee(fee) || views.p25 <= 0) return null;
  const mid = feeMid(fee);
  return { p25: mid / views.p75, p50: mid / views.p50, p75: mid / views.p25 };
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const r4 = (x: number | null): number | null => (x === null ? null : round(x, 4));

type Scored = { ranked: RankedCreator; exact: number; tier: Tier | null };

/** §6.8: sub-scores → renormalized groups → weighted total → tier quota → rank stability. Gate failures are dropped. */
export function scoreCandidates(pool: EvaluatedCandidate[], ctx: ScoringContext): RankedCreator[] {
  const W = normalizeWeights(ctx.weights);
  const passing = pool.filter((c) => c.gateFailures.length === 0);
  if (passing.length === 0) return [];
  const rows = passing.map((c) => raw(c, ctx));

  const poolSemantic = nums(rows.map((r) => r.semantic));
  const poolEr = nums(rows.map((r) => r.erShrunk));
  const poolRawEr = nums(rows.map((r) => r.rawEr));
  const poolVpf = nums(rows.map((r) => r.vpf));
  const poolViews = nums(rows.map((r) => r.medianViews));
  const poolCv = nums(rows.map((r) => r.cv));
  const poolGrowth = nums(rows.map((r) => r.growth));
  const poolCpv = nums(rows.map((r) => r.cpv));
  const poolCl = nums(rows.map((r) => r.commentLike));
  const cl05 = quantile(poolCl, 0.05);
  const cl95 = quantile(poolCl, 0.95);

  // suspectedInjection → LLM-derived sub-scores pinned to the median of the trusted pool.
  const trusted = rows.filter((r) => !r.c.suspectedInjection);
  const pinned: Record<(typeof LLM_SUBS)[number], number | null> = {
    relevance: median(nums(trusted.map((r) => r.relevance))),
    style: median(nums(trusted.map((r) => r.style))),
    interest: median(nums(trusted.map((r) => r.interest))),
    suitability: median(nums(trusted.map((r) => r.suitability))),
  };

  const fetchedTimes = rows.map((r) => Date.parse(r.c.dossier.fetchedAt)).filter((t) => !Number.isNaN(t));
  const refNow = fetchedTimes.length > 0 ? Math.max(...fetchedTimes) : null;

  const prepared = rows.map((r) => {
    const d = r.c.dossier;
    const m = d.metrics;
    const inj = r.c.suspectedInjection;

    const semantic =
      r.semantic === null ? null : poolSemantic.length >= 3 ? pctRank(r.semantic, poolSemantic) : clamp01((r.semantic - 0.2) / 0.5);

    const er = r.erShrunk === null ? null : pctOrBench(r.erShrunk, poolEr, r.erBench, false);

    const vpfPct = r.vpf === null ? null : pctOrBench(r.vpf, poolVpf, tierBenchmark(ctx.ref, r.tier, 'views_per_follower'), false);
    const viewsPct = r.medianViews === null ? null : pctOrBench(r.medianViews, poolViews, tierBenchmark(ctx.ref, r.tier, 'median_views'), true);
    const reach = vpfPct !== null && viewsPct !== null ? 0.5 * vpfPct + 0.5 * viewsPct : (viewsPct ?? vpfPct);

    const consistency = mean(nums([r.cv === null ? null : 1 - pctRank(r.cv, poolCv), r.ppw === null ? null : Math.min(1, r.ppw / 3)]));

    const growth = r.growth === null ? null : poolGrowth.length >= 3 ? pctRank(r.growth, poolGrowth) : clamp01(0.5 + 5 * r.growth);

    let authenticity: number | null = null;
    if (m.videosAnalyzed > 0) {
      let a = 1;
      if (r.rawEr !== null) {
        // ER outlier: pool z-score once the pool is large enough for a stable SD (with the creator inside its own
        // mean/SD |z| cannot exceed (n-1)/√n, which is > 2.5 only from n = 9); smaller pools use the tier benchmark.
        const erMean = mean(poolRawEr);
        const erSd = stdev(poolRawEr);
        if (poolRawEr.length >= MIN_POOL_FOR_ER_Z && erMean !== null && erSd !== null && erSd > 0) {
          if (Math.abs((r.rawEr - erMean) / erSd) > 2.5) a -= 0.25;
        } else if (r.erBench && (r.rawEr > 2.5 * r.erBench.p75 || r.rawEr < 0.25 * r.erBench.p25)) {
          a -= 0.25;
        }
      }
      if (m.videosAnalyzed >= 8 && isNum(m.p25Views) && isNum(m.p75Views) && m.p25Views > 0 && m.p75Views / m.p25Views < 1.15) a -= 0.15;
      if (isNum(r.growth) && r.growth >= Math.log(1.5) && r.medianViews !== null && r.maxViews !== null && r.maxViews < 5 * r.medianViews) a -= 0.2;
      const bot = d.audience?.commentSignals?.botLikeShare ?? null;
      if (isNum(bot)) a -= bot >= 0.3 ? 0.35 : bot >= 0.15 ? 0.2 : 0;
      if (poolCl.length >= 10 && r.commentLike !== null && cl05 !== null && cl95 !== null && (r.commentLike < cl05 || r.commentLike > cl95)) a -= 0.1;
      authenticity = clamp01(a);
    }

    const cpv = r.cpv === null ? null : 1 - pctOrBench(r.cpv, poolCpv, cpvBenchmark(ctx.ref, r.tier), false);

    const sub: SubScores = {
      fit: { semantic: r4(semantic), category: r4(r.category), relevance: r4(inj ? pinned.relevance : r.relevance), style: r4(inj ? pinned.style : r.style) },
      audience: { demo: r4(r.demo), lang_region: r4(r.langRegion), interest: r4(inj ? pinned.interest : r.interest) },
      performance: { er: r4(er), reach: r4(reach), consistency: r4(consistency), growth: r4(growth), sponsored_perf: r4(r.sponsoredPerf) },
      trust: { authenticity: r4(authenticity), saturation: r4(r.saturation), suitability: r4(inj ? pinned.suitability : r.suitability) },
      cost: { cpv: r4(cpv) },
    };
    const agg = aggregateGroups(sub, { demoConfidence: r.demoConf, unavailable: inj ? LLM_SUBS : [] });
    return { r, sub, agg };
  });

  // A group with no data at all takes the pool median of that group (neutral 0.5 if nobody has it).
  const groupFallback = {} as Record<ScoreGroup, number>;
  for (const g of GROUPS) groupFallback[g] = median(nums(prepared.map((p) => p.agg.groups[g]))) ?? 0.5;

  const scored: Scored[] = prepared.map(({ r, sub, agg }) => {
    const groups: GroupScores = {
      fit: round(agg.groups.fit ?? groupFallback.fit, 4),
      audience: round(agg.groups.audience ?? groupFallback.audience, 4),
      performance: round(agg.groups.performance ?? groupFallback.performance, 4),
      trust: round(agg.groups.trust ?? groupFallback.trust, 4),
      cost: round(agg.groups.cost ?? groupFallback.cost, 4),
    };
    const exact = totalScore(groups, W);

    const d = r.c.dossier;
    const videoFactor = Math.min(1, d.metrics.videosAnalyzed / 20);
    const fetched = Date.parse(d.fetchedAt);
    const freshness = refNow === null || Number.isNaN(fetched) ? 0.75 : Math.max(0.5, 1 - (refNow - fetched) / 86_400_000 / 60);
    let completeness = 0;
    for (const g of GROUPS) completeness += W[g] * agg.coverage[g];
    const dataConfidence = round((videoFactor + r.demoConf + freshness + completeness) / 4, 2);

    return {
      exact,
      tier: r.tier,
      ranked: {
        creatorId: d.creatorId,
        handle: d.profile.handle,
        rank: 0,
        total: round(exact, 1),
        groups,
        sub,
        missingFeatures: agg.missing,
        rankStability: null,
        pairwiseAdjusted: false,
        dataConfidence,
        gateFailures: [],
        suspectedInjection: r.c.suspectedInjection,
      },
    };
  });

  scored.sort((a, b) => b.exact - a.exact || cmpStr(a.ranked.creatorId, b.ranked.creatorId));
  const ordered = ctx.tierQuota ? applyTierQuota(scored, ctx.tierQuota) : scored;
  const stability = rankStability(
    ordered.map((s) => s.ranked.groups),
    W,
    ctx.seed ?? DEFAULT_STABILITY_SEED,
  );
  return ordered.map((s, i) => ({ ...s.ranked, rank: i + 1, rankStability: stability[i] ?? null }));
}

/** Greedy swap: promote the best nano/micro candidates below the cut until the top N meets the small-tier share. */
function applyTierQuota(list: Scored[], quota: { smallShareMin: number; topN?: number }): Scored[] {
  const arr = [...list];
  const n = Math.min(quota.topN ?? 5, arr.length);
  const required = Math.min(n, Math.ceil(clamp01(quota.smallShareMin) * n - 1e-9));
  const isSmall = (s: Scored) => s.tier !== null && SMALL_TIERS.includes(s.tier);
  let count = arr.slice(0, n).filter(isSmall).length;
  while (count < required) {
    const j = arr.findIndex((s, idx) => idx >= n && isSmall(s));
    let i = -1;
    for (let k = n - 1; k >= 0; k -= 1) {
      const s = arr[k];
      if (s && !isSmall(s)) {
        i = k;
        break;
      }
    }
    if (j < 0 || i < 0) break;
    const promoted = arr.splice(j, 1)[0] as Scored;
    const demoted = arr.splice(i, 1)[0] as Scored;
    arr.splice(n - 1, 0, promoted);
    arr.splice(n, 0, demoted);
    count += 1;
  }
  return arr;
}

const STABILITY_DRAWS = 200;
const STABILITY_CONCENTRATION = 50;
const STABILITY_TOP_K = 5;
const STABILITY_REPORTED = 10;
const DEFAULT_STABILITY_SEED = 42;

/**
 * §6.7 rank stability: Dirichlet(50·W) weight draws; returns P(in top 5) for the first 10 positions of `ordered`
 * and null for the rest. Ties within a draw keep the base order.
 */
export function rankStability(ordered: readonly GroupScores[], weights: GroupWeights, seed = DEFAULT_STABILITY_SEED): (number | null)[] {
  const W = normalizeWeights(weights);
  const alpha = GROUPS.map((g) => STABILITY_CONCENTRATION * W[g]);
  const rand = mulberry32(seed);
  const hits = new Array<number>(ordered.length).fill(0);
  const idx = ordered.map((_, i) => i);
  for (let draw = 0; draw < STABILITY_DRAWS; draw += 1) {
    const w = sampleDirichlet(alpha, rand);
    const totals = ordered.map((gs) => GROUPS.reduce((acc, g, k) => acc + (w[k] ?? 0) * gs[g], 0));
    const top = [...idx].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0) || a - b).slice(0, STABILITY_TOP_K);
    for (const i of top) hits[i] = (hits[i] ?? 0) + 1;
  }
  return ordered.map((_, i) => (i < STABILITY_REPORTED ? round((hits[i] ?? 0) / STABILITY_DRAWS, 2) : null));
}

/**
 * Re-weights existing group scores and re-ranks (no LLM, no new data). Gate-failing rows stay at the end. Pass the
 * seed scoreCandidates used (ScoringContext.seed) so unchanged weights reproduce the same rank stability.
 */
export function rescore(ranked: RankedCreator[], weights: GroupWeights, seed = DEFAULT_STABILITY_SEED): RankedCreator[] {
  const W = normalizeWeights(weights);
  const rows = ranked.map((r) => ({ r, exact: totalScore(r.groups, W), failed: r.gateFailures.length > 0 }));
  rows.sort((a, b) => Number(a.failed) - Number(b.failed) || b.exact - a.exact || cmpStr(a.r.creatorId, b.r.creatorId));
  const passingCount = rows.filter((x) => !x.failed).length;
  const stability = rankStability(
    rows.slice(0, passingCount).map((x) => x.r.groups),
    W,
    seed,
  );
  return rows.map((x, i) => ({
    ...x.r,
    rank: i + 1,
    total: round(x.exact, 1),
    rankStability: i < passingCount ? (stability[i] ?? null) : null,
    pairwiseAdjusted: false,
  }));
}

/** Pool median per group on the 0–100 display scale (FinalResult.benchmarks.poolMedianScores). */
export function poolMedianScores(ranked: RankedCreator[]): GroupWeights {
  const med = (g: ScoreGroup) => Math.round(100 * (median(ranked.map((r) => r.groups[g])) ?? 0));
  return { fit: med('fit'), audience: med('audience'), performance: med('performance'), trust: med('trust'), cost: med('cost') };
}

/**
 * Average effective weight of `demo` in the total (W_audience × its renormalized inner weight), for
 * FinalResult.methodology.effectiveDemographicWeight.
 */
export function effectiveDemographicWeight(pool: EvaluatedCandidate[], ctx: Pick<ScoringContext, 'weights' | 'brandAudience'>): number {
  const W = normalizeWeights(ctx.weights);
  const passing = pool.filter((c) => c.gateFailures.length === 0);
  if (passing.length === 0) return 0;
  const shares = passing.map((c) => {
    const demo = demoScore(ctx.brandAudience, c.dossier.audience);
    const sub: SubScores = {
      fit: { semantic: null, category: null, relevance: null, style: null },
      audience: {
        demo,
        lang_region: langRegion(c.dossier),
        interest: rubric(c.evaluation, 'audience_fit'),
      },
      performance: { er: null, reach: null, consistency: null, growth: null, sponsored_perf: null },
      trust: { authenticity: null, saturation: null, suitability: null },
      cost: { cpv: null },
    };
    return aggregateGroups(sub, { demoConfidence: demoConfidence(c.dossier.audience) }).demoInnerWeight;
  });
  return round(W.audience * (mean(shares) ?? 0), 3);
}
