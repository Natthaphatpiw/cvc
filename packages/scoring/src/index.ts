export {
  PRESETS,
  INNER_WEIGHTS,
  GROUPS,
  DEMO_CONFIDENCE_MIN,
  ER_SHRINK_K,
  TIER_LABEL_TH,
  normalizeWeights,
  type InnerWeights,
} from './presets';
export { tierFor, estimateFee, estCpv, feeMid, tierBenchmark, kpiBenchmark, findCategory, parentCategoryId } from './ref';
export { computeMetrics, isSponsoredVideo, videoEr } from './metrics';
export { GATE_CODES, SUITABILITY_ALLOWED, gate0a, gate0b, gate0c, preScore, restrictedCategories, type GateCode, type GateContext } from './gates';
export {
  scoreCandidates,
  rescore,
  demoScore,
  demoConfidence,
  poolMedianScores,
  aggregateGroups,
  totalScore,
  categoryScore,
  rankStability,
  effectiveDemographicWeight,
  type EvaluatedCandidate,
  type ScoringContext,
  type GroupAggregation,
} from './score';
export { seedFrom } from './stats';
export { computeExpectedKpis, roundCount } from './kpis';
export { playbookHints, postingWindow, describePostingWindowTh, ROLE_LABEL_TH, FORMAT_LABEL_TH, type PlaybookHints } from './playbook';
export { buildPortfolioPlan, type PortfolioItem } from './portfolio';
export { baseNextActions, creatorNextActions } from './actions';
