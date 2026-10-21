import { getAgentStore } from '@cvc/db';
import { baseNextActions, buildPortfolioPlan, poolMedianScores, rescore, seedFrom } from '@cvc/scoring';
import { FinalResult, type BrandProfile, type GroupWeights, type Objective, type Recommendation } from '@cvc/schemas';
import { ApiFailure } from '../http';
import {
  buildAlternative,
  buildRecommendation,
  codeOnlyCuration,
  effectiveDemographicWeight,
  recommendedTiersFor,
  sortByRank,
  templateHeadlineTh,
  templateSummaryTh,
  type RankedRow,
} from '../pipeline/assemble';
import { loadCovers } from '../pipeline/candidates';
import { loadRef } from '../pipeline/context';
import { ALTERNATIVES_COUNT } from '../pipeline/types';

const GROUPS = ['fit', 'audience', 'performance', 'trust', 'cost'] as const;

/** Accepts fractions or points; returns weights that sum to 1. */
export function normalizeWeights(w: GroupWeights): GroupWeights {
  const values = GROUPS.map((g) => w[g]);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new ApiFailure(400, 'invalid_weights', 'น้ำหนักคะแนนต้องเป็นตัวเลขที่ไม่ติดลบ');
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new ApiFailure(400, 'invalid_weights', 'ต้องมีน้ำหนักคะแนนอย่างน้อยหนึ่งด้านที่มากกว่า 0');
  return { fit: w.fit / sum, audience: w.audience / sum, performance: w.performance / sum, trust: w.trust / sum, cost: w.cost / sum };
}

const pickIds = (recs: readonly Recommendation[]): string => recs.map((r) => r.creatorId).join(',');

/**
 * Re-weights the stored RankedCreators (no LLM, §6.7 what-if) and rebuilds the recommendation order. Creators that
 * move into the top N without a narrative get template text and narrativeStatus 'pending'. Everything derived from the
 * picks (plan, next actions, recommended tiers, headline and summary) is rebuilt from the new order.
 */
export async function rescoreResult(a: { result: FinalResult; weights: GroupWeights; preset: Objective }): Promise<FinalResult> {
  const { result, weights } = a;
  const store = getAgentStore();
  const [run, rows, ref, covers] = await Promise.all([
    store.getRun(result.runId),
    store.listCandidates(result.runId),
    loadRef(),
    loadCovers(result.runId),
  ]);
  const ranked = sortByRank(rows);
  if (ranked.length === 0) {
    throw new ApiFailure(409, 'rescore_unavailable', 'ไม่พบข้อมูลคะแนนเดิมของผลลัพธ์นี้ จึงจัดอันดับใหม่ไม่ได้');
  }
  const brand: BrandProfile | null = run?.brandProfileId ? await store.getBrandProfile(run.brandProfileId) : null;

  // Same stability seed as rankStep, so unchanged weights reproduce the stored P(top-N) values.
  const reRanked = rescore(
    ranked.map((r) => r.ranked),
    weights,
    seedFrom(result.runId),
  );
  const byId = new Map(ranked.map((r) => [r.creatorId, r]));
  const rows2: RankedRow[] = reRanked
    .map((rc) => {
      const row = byId.get(rc.creatorId);
      return row ? { ...row, ranked: rc } : null;
    })
    .filter((r): r is RankedRow => r !== null)
    .sort((x, y) => x.ranked.rank - y.ranked.rank);

  const nCreators = result.brief.nCreators;
  const objective = result.brief.objective;
  const poolMedians = poolMedianScores(reRanked);
  const existing = new Map(result.recommendations.map((r) => [r.creatorId, r]));
  const brandPillars = brand?.brand.contentPillars ?? result.brand.contentPillars;

  const recommendations: Recommendation[] = rows2.slice(0, nCreators).map((row, i) => {
    const prev = existing.get(row.creatorId);
    if (prev) {
      return {
        ...prev,
        rank: i + 1,
        scores: { ...prev.scores, total: Math.round(row.ranked.total), rankStability: row.ranked.rankStability },
        benchmarks: { ...prev.benchmarks, poolMedianScores: poolMedians },
      };
    }
    const categoryId = row.evaluation?.categoryTags[0] ?? brand?.brand.industryId ?? null;
    const item = codeOnlyCuration({ row, objective, ref, categoryId, status: 'pending' });
    return buildRecommendation({
      rank: i + 1,
      row,
      item,
      poolMedians,
      ref,
      categoryId,
      covers: covers[row.creatorId] ?? {},
      brandPillars,
    });
  });
  const alternatives = rows2.slice(nCreators, nCreators + ALTERNATIVES_COUNT).map(buildAlternative);

  const plan = buildPortfolioPlan({
    objective,
    budgetTHB: result.brief.budgetTHB,
    items: recommendations.map((r) => ({
      creatorId: r.creatorId,
      handle: r.handle,
      fee: r.estFeeTHB,
      kpis: r.expectedKpis,
      role: r.playbook.role,
    })),
  });

  // The LLM narrative names the original picks and plan; keep it only while those are unchanged. The code summary
  // also quotes rank 1's total, so it is rebuilt whenever it was the template.
  const counts = { candidatesScanned: result.methodology.candidatesScanned, candidatesEvaluated: result.methodology.candidatesEvaluated };
  const picksChanged = pickIds(recommendations) !== pickIds(result.recommendations) || plan.budgetFitTh !== result.plan.budgetFitTh;
  const wasTemplateSummary =
    result.consultantSummaryTh === templateSummaryTh({ ...counts, top: result.recommendations[0], budgetFitTh: result.plan.budgetFitTh });
  const headlineTh = picksChanged
    ? templateHeadlineTh({ brandName: result.brand.name, objective, count: recommendations.length })
    : result.headlineTh;
  const consultantSummaryTh =
    picksChanged || wasTemplateSummary
      ? templateSummaryTh({ ...counts, top: recommendations[0], budgetFitTh: plan.budgetFitTh })
      : result.consultantSummaryTh;

  return FinalResult.parse({
    ...result,
    headlineTh,
    consultantSummaryTh,
    recommendations,
    alternatives,
    plan,
    nextActions: baseNextActions({ objective, creators: recommendations.map((r) => ({ creatorId: r.creatorId, handle: r.handle })) }),
    brief: {
      ...result.brief,
      recommendedTiers: brand ? recommendedTiersFor(brand.campaign.preferredTiers, recommendations) : result.brief.recommendedTiers,
      budgetFitNoteTh: plan.budgetFitTh,
    },
    methodology: {
      ...result.methodology,
      preset: a.preset,
      weights,
      effectiveDemographicWeight: effectiveDemographicWeight(weights, recommendations),
    },
  });
}
