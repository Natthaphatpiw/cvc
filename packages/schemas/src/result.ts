import { z } from 'zod';
import { AudienceSource, Confidence, EvidenceSourceType, MinMax, NarrativeStatus, Objective, Tier, ValueSource } from './common';
import { ExpectedKpis, NextAction, Playbook, PortfolioPlan } from './consultant';
import { GroupWeights as GroupWeightsShape, RubricScore, SubScores } from './evaluation';

export const Recommendation = z.object({
  rank: z.number().int(),
  creatorId: z.string(),
  addedVia: z.enum(['pipeline', 'chat']),
  handle: z.string(),
  displayName: z.string().nullable(),
  profileUrl: z.string(),
  /** Vercel Blob public URL (creator-media/avatars/…) or null → UI renders initials */
  avatarUrl: z.string().nullable(),
  tier: Tier.nullable(),
  followers: z.number().nullable(),
  medianViews: z.number().nullable(),
  erViews: z.number().nullable(),
  postsPerWeek: z.number().nullable(),
  lastPostedAt: z.string().nullable(),
  audience: z.object({
    thaiShare: z.number().nullable(),
    ageTop: z.array(z.string()),
    ageDist: z.record(z.string(), z.number()).nullable(),
    femaleShare: z.number().nullable(),
    sampleSize: z.number().int().nullable(),
    ci95: z.tuple([z.number(), z.number()]).nullable(),
    confidence: Confidence,
    source: AudienceSource,
  }),
  scores: z.object({
    total: z.number(),
    fit: z.number(),
    audience: z.number(),
    performance: z.number(),
    trust: z.number(),
    cost: z.number(),
    rankStability: z.number().nullable(),
    sub: SubScores,
    missingFeatures: z.array(z.string()),
  }),
  benchmarks: z.object({
    tierMedianViews: z.number().nullable(),
    tierMedianEr: z.number().nullable(),
    tierMedianCPV: z.number().nullable(),
    poolMedianScores: GroupWeightsShape,
  }),
  rubric: z.array(RubricScore),
  suspectedInjection: z.boolean(),
  narrativeStatus: NarrativeStatus,
  whyMatchTh: z.array(z.object({ text: z.string(), evidenceRefs: z.array(z.string()) })),
  risksTh: z.array(z.string()),
  /** paragraph on how this creator fits the brand and its target customers (empty in results made before it existed) */
  fitSummaryTh: z.string().default(''),
  storyline: z
    .object({
      conceptTh: z.string(),
      hookTh: z.string(),
      format: z.enum(['in_feed', 'live', 'affiliate', 'series']),
      ctaTh: z.string(),
      sampleCaptionTh: z.string(),
      disclosure: z.string(),
    })
    .nullable(),
  pitchAnglesTh: z.array(z.string()),
  estFeeTHB: MinMax,
  estCPV: z.number().nullable(),
  topVideos: z.array(z.object({ url: z.string(), coverUrl: z.string().nullable(), views: z.number().nullable(), whyTh: z.string() })),
  /** consultant layer (new): how to use this creator, what to expect, what to do next */
  playbook: Playbook,
  expectedKpis: ExpectedKpis,
  nextActions: z.array(NextAction),
  evidenceRefs: z.array(z.string()),
  dataConfidence: z.number(),
});
export type Recommendation = z.infer<typeof Recommendation>;

export const Alternative = z.object({
  creatorId: z.string(),
  handle: z.string(),
  profileUrl: z.string(),
  avatarUrl: z.string().nullable(),
  reasonTh: z.string(),
  total: z.number(),
});
export type Alternative = z.infer<typeof Alternative>;

export const ResultEvidence = z.object({
  ref: z.string(),
  title: z.string(),
  url: z.string(),
  sourceType: EvidenceSourceType,
  retrievedAt: z.string(),
});
export type ResultEvidence = z.infer<typeof ResultEvidence>;

/** FinalResult v1 — the contract between agent and web (SYSTEM_DESIGN §4.7, plus the consultant layer). */
export const FinalResult = z.object({
  schemaVersion: z.literal('1.0'),
  resultId: z.string(),
  runId: z.string(),
  version: z.number().int().min(1),
  generatedAt: z.string(),
  locale: z.literal('th'),
  isPartial: z.boolean(),
  /** true when produced without real providers/LLM keys (demo fixtures) */
  isDemo: z.boolean(),
  redactedCreators: z.number().int().nonnegative(),
  /** the screen's one finding, one sentence */
  headlineTh: z.string(),
  consultantSummaryTh: z.string(),
  brand: z.object({
    name: z.string(),
    logoUrl: z.string().nullable(),
    oneLinerTh: z.string(),
    /** the header paragraph: what the analysis learned about the brand (and what it inferred for the client) */
    overviewTh: z.string().default(''),
    industry: z.string(),
    positioning: z.string(),
    audienceSummaryTh: z.string(),
    toneKeywords: z.array(z.string()),
    contentPillars: z.array(z.string()),
    evidenceRefs: z.array(z.string()),
  }),
  brief: z.object({
    objective: Objective,
    /** 'inferred' = the client left it empty and the agent chose it */
    objectiveSource: ValueSource.default('user'),
    objectiveReasonTh: z.string().default(''),
    budgetTHB: MinMax.nullable(),
    nCreators: z.number().int(),
    nCreatorsSource: ValueSource.default('user'),
    audienceSource: ValueSource.default('user'),
    recommendedTiers: z.array(Tier),
    budgetFitNoteTh: z.string(),
    keyMessagesTh: z.array(z.string()),
  }),
  methodology: z.object({
    preset: Objective,
    weights: GroupWeightsShape,
    effectiveDemographicWeight: z.number(),
    candidatesScanned: z.number().int(),
    candidatesEvaluated: z.number().int(),
    dataSources: z.array(z.string()),
    dataAsOf: z.string(),
    caveatsTh: z.array(z.string()),
  }),
  recommendations: z.array(Recommendation),
  addedFromChat: z.array(Recommendation),
  alternatives: z.array(Alternative),
  plan: PortfolioPlan,
  nextActions: z.array(NextAction),
  evidence: z.array(ResultEvidence),
});
export type FinalResult = z.infer<typeof FinalResult>;
