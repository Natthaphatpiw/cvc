import { z } from 'zod';
import { Confidence, KpiRange, MinMax } from './common';

/**
 * Expected KPIs for one post by one creator — computed in code from the creator's own history
 * (organic vs sponsored posts) and agency benchmarks (ref.kpi_benchmarks). Never written by an LLM.
 */
export const ExpectedKpis = z.object({
  perPost: z.object({
    views: KpiRange,
    engagements: KpiRange,
    /** expected views-based ER as a fraction (0.071 = 7.1%) */
    erViews: z.number().nullable(),
  }),
  cost: z.object({
    feeTHB: MinMax,
    /** THB per view: p25 = cheapest case (fee min / views p75) … p75 = fee max / views p25 */
    cpv: KpiRange.nullable(),
    /** THB per engagement at p50 */
    cpe: z.number().nullable(),
  }),
  /** Only for conversion / tiktok_shop objectives. Assumptions are shown to the user. */
  conversion: z
    .object({
      clicks: KpiRange,
      orders: KpiRange,
      assumptions: z.object({ ctr: z.number(), cvr: z.number(), source: z.string() }),
    })
    .nullable(),
  basis: z.object({
    method: z.enum(['creator_history', 'tier_benchmark', 'mixed']),
    videosAnalyzed: z.number().int(),
    sponsoredVideosAnalyzed: z.number().int(),
    /** sponsored views ÷ organic views applied to organic history */
    sponsoredFactor: z.number(),
    sponsoredFactorSource: z.enum(['creator_history', 'benchmark']),
    windowDays: z.number().int(),
    benchmarkSources: z.array(z.string()),
    notesTh: z.array(z.string()),
  }),
  confidence: Confidence,
});
export type ExpectedKpis = z.infer<typeof ExpectedKpis>;

export const CreatorRole = z.enum(['hero_awareness', 'conversion_driver', 'community_trust', 'ugc_content', 'live_seller']);
export type CreatorRole = z.infer<typeof CreatorRole>;

export const ContentFormat = z.enum(['in_feed', 'live', 'affiliate', 'series', 'duet_stitch', 'spark_ads']);
export type ContentFormat = z.infer<typeof ContentFormat>;

export const CollaborationModel = z.enum(['fixed_fee', 'affiliate_commission', 'hybrid', 'gifting']);
export type CollaborationModel = z.infer<typeof CollaborationModel>;

/** How to use this creator: consultant guidance. Role/model/formats/postingWindow come from code hints; the Th text from LLM4. */
export const Playbook = z.object({
  role: CreatorRole,
  roleReasonTh: z.string(),
  recommendedFormats: z.array(ContentFormat),
  postingWindow: z
    .object({
      /** 0 = Monday … 6 = Sunday */
      bestDays: z.array(z.number().int().min(0).max(6)),
      bestHours: z.array(z.number().int().min(0).max(23)),
      basisTh: z.string(),
    })
    .nullable(),
  collaborationModel: CollaborationModel,
  collaborationNoteTh: z.string(),
  contentAnglesTh: z.array(z.string()),
  briefDosTh: z.array(z.string()),
  briefDontsTh: z.array(z.string()),
  negotiationTh: z.array(z.string()),
  riskMitigations: z.array(z.object({ riskTh: z.string(), mitigationTh: z.string() })),
});
export type Playbook = z.infer<typeof Playbook>;

export const NextActionOwner = z.enum(['planner', 'client', 'creator']);
export const NextActionCategory = z.enum(['outreach', 'brief', 'contract', 'tracking', 'launch', 'report']);

export const NextAction = z.object({
  id: z.string(),
  titleTh: z.string(),
  detailTh: z.string(),
  owner: NextActionOwner,
  category: NextActionCategory,
  /** days after the planner confirms the shortlist */
  dueInDays: z.number().int().nonnegative(),
  creatorId: z.string().nullable(),
});
export type NextAction = z.infer<typeof NextAction>;

export const PortfolioPlan = z.object({
  selectedCreatorIds: z.array(z.string()),
  budgetAllocation: z.array(
    z.object({ creatorId: z.string(), handle: z.string(), feeTHB: MinMax, shareOfBudget: z.number().nullable() }),
  ),
  totals: z.object({
    feeTHB: MinMax,
    views: KpiRange,
    engagements: KpiRange,
    clicks: KpiRange.nullable(),
    orders: KpiRange.nullable(),
  }),
  /** budget fit computed in code: within / over / under budget */
  budgetFit: z.enum(['within', 'over', 'under', 'no_budget']),
  budgetFitTh: z.string(),
  mixTh: z.string(),
  timeline: z.array(z.object({ week: z.number().int().min(1), titleTh: z.string(), tasksTh: z.array(z.string()) })),
  measurementPlanTh: z.array(z.string()),
});
export type PortfolioPlan = z.infer<typeof PortfolioPlan>;

/** LLM4 output per creator: narrative only, numbers via {{metric:…}} placeholders that code fills. */
export const CuratorOutput = z.object({
  creatorId: z.string(),
  whyMatchTh: z.array(z.object({ text: z.string(), evidenceRefs: z.array(z.string()) })),
  risksTh: z.array(z.string()),
  storyline: z.object({
    conceptTh: z.string(),
    hookTh: z.string(),
    format: z.enum(['in_feed', 'live', 'affiliate', 'series']),
    ctaTh: z.string(),
    sampleCaptionTh: z.string(),
    disclosure: z.string(),
  }),
  pitchAnglesTh: z.array(z.string()),
  topVideoNotes: z.array(z.object({ videoId: z.string(), whyTh: z.string() })),
  playbookText: z.object({
    roleReasonTh: z.string(),
    collaborationNoteTh: z.string(),
    contentAnglesTh: z.array(z.string()),
    briefDosTh: z.array(z.string()),
    briefDontsTh: z.array(z.string()),
    negotiationTh: z.array(z.string()),
    riskMitigations: z.array(z.object({ riskTh: z.string(), mitigationTh: z.string() })),
  }),
});
export type CuratorOutput = z.infer<typeof CuratorOutput>;

/** LLM4 portfolio-level narrative. */
export const PortfolioNarrative = z.object({
  headlineTh: z.string(),
  consultantSummaryTh: z.string(),
  mixTh: z.string(),
  nextStepsTh: z.array(z.string()),
});
export type PortfolioNarrative = z.infer<typeof PortfolioNarrative>;
