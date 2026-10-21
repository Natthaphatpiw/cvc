import { z } from 'zod';
import { SuitabilityTier } from './common';

export const RubricCriterion = z.enum(['audience_fit', 'content_product_relevance', 'persuasion', 'credibility', 'format_execution']);
export type RubricCriterion = z.infer<typeof RubricCriterion>;

export const RubricScore = z.object({
  criterion: RubricCriterion,
  score: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  evidenceVideoIds: z.array(z.string()),
  noteTh: z.string(),
});
export type RubricScore = z.infer<typeof RubricScore>;

/** LLM2b output per creator (§4.8). */
export const KolEvaluation = z.object({
  creatorId: z.string(),
  handle: z.string(),
  rubric: z.array(RubricScore),
  suitabilityTier: SuitabilityTier,
  categoryTags: z.array(z.string()),
  toneTags: z.array(z.string()),
  possibleMinor: z.boolean(),
  rationaleTh: z.string(),
});
export type KolEvaluation = z.infer<typeof KolEvaluation>;

/** All sub-scores in [0,1]; null = not available (renormalized away, §6.4). */
export const SubScores = z.object({
  fit: z.object({ semantic: z.number().nullable(), category: z.number().nullable(), relevance: z.number().nullable(), style: z.number().nullable() }),
  audience: z.object({ demo: z.number().nullable(), lang_region: z.number().nullable(), interest: z.number().nullable() }),
  performance: z.object({
    er: z.number().nullable(),
    reach: z.number().nullable(),
    consistency: z.number().nullable(),
    growth: z.number().nullable(),
    sponsored_perf: z.number().nullable(),
  }),
  trust: z.object({ authenticity: z.number().nullable(), saturation: z.number().nullable(), suitability: z.number().nullable() }),
  cost: z.object({ cpv: z.number().nullable() }),
});
export type SubScores = z.infer<typeof SubScores>;

export const ScoreGroup = z.enum(['fit', 'audience', 'performance', 'trust', 'cost']);
export type ScoreGroup = z.infer<typeof ScoreGroup>;

export const GroupWeights = z.object({ fit: z.number(), audience: z.number(), performance: z.number(), trust: z.number(), cost: z.number() });
export type GroupWeights = z.infer<typeof GroupWeights>;

/** Group scores in [0,1]. */
export const GroupScores = GroupWeights;
export type GroupScores = z.infer<typeof GroupScores>;

/** LLM3 output (code + pairwise). */
export const RankedCreator = z.object({
  creatorId: z.string(),
  handle: z.string(),
  rank: z.number().int(),
  total: z.number(),
  groups: GroupScores,
  sub: SubScores,
  missingFeatures: z.array(z.string()),
  rankStability: z.number().nullable(),
  pairwiseAdjusted: z.boolean(),
  dataConfidence: z.number(),
  gateFailures: z.array(z.string()),
  suspectedInjection: z.boolean(),
});
export type RankedCreator = z.infer<typeof RankedCreator>;
