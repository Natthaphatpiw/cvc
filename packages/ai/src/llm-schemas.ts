// LLM-side schemas for OpenAI Structured Outputs (strict mode): every field required, optional = nullable, no unions
// at the root, no records/tuples/defaults/literals. Stage code maps these to the @cvc/schemas domain types and then
// validates with the domain schema.
import { BrandSafetyLevel, Objective, RubricCriterion, SuitabilityTier, Tier } from '@cvc/schemas';
import { z } from 'zod';

const str = z.string();
const strs = z.array(z.string());

/** Distribution as key/share pairs (records are not strict-compatible). */
export const LlmDistribution = z.array(z.object({ key: str, share: z.number() }));

export const LlmBrief = z.object({
  nameTh: str.nullable(),
  aliases: strs,
  audienceFreeText: str.nullable(),
  audienceFromVoice: str.nullable(),
  audienceFromImages: str.nullable(),
  imageFindings: z.array(
    z.object({ assetPathname: str, type: z.enum(['fb_page', 'tiktok_profile', 'product', 'brief', 'other']), facts: strs }),
  ),
  campaignHints: z.object({
    objective: Objective.nullable(),
    budgetMinTHB: z.number().nullable(),
    budgetMaxTHB: z.number().nullable(),
    nCreators: z.number().int().nullable(),
    preferredTiers: z.array(Tier),
  }),
  mustInclude: strs,
  extraCompetitors: strs,
  extraUrls: strs,
});
export type LlmBrief = z.infer<typeof LlmBrief>;

export const LlmEvidenceCard = z.object({
  products: z.array(z.object({ name: str, priceTHB: z.number().nullable(), notes: str.nullable() })),
  usp: strs,
  tone: strs,
  priceTier: z.enum(['mass', 'masstige', 'premium', 'luxury', 'unknown']),
  audienceCues: strs,
  claims: z.array(z.object({ text: str, sourceRef: str })),
  stats: z.array(z.object({ key: str, value: str })),
});
export type LlmEvidenceCard = z.infer<typeof LlmEvidenceCard>;

export const LlmBrandProfile = z.object({
  brand: z.object({
    industryId: str,
    subCategories: strs,
    products: z.array(
      z.object({
        name: str,
        categoryId: str.nullable(),
        priceBandTHB: z.object({ min: z.number(), max: z.number() }).nullable(),
        keyBenefits: strs,
        usp: str.nullable(),
      }),
    ),
    pricePositioning: z.enum(['mass', 'masstige', 'premium', 'luxury']),
    personality: z.object({ toneKeywords: strs, formality: z.number(), humor: z.number(), energy: z.number() }),
    languageStyle: z.object({ primary: str, englishMix: z.boolean(), register: z.enum(['casual', 'polite', 'formal']) }),
    contentPillars: strs,
    visualStyle: strs,
    regulatedCategory: z.enum(['none', 'cosmetics', 'supplement', 'alcohol', 'finance', 'medical']),
  }),
  audience: z.object({
    segments: z.array(
      z.object({
        label: str,
        ageDist: LlmDistribution,
        genderDist: LlmDistribution,
        regionDist: LlmDistribution,
        interests: strs,
        painPoints: strs,
        purchaseDrivers: strs,
      }),
    ),
    source: z.enum(['user_selected', 'inferred', 'mixed']),
    confidence: z.number(),
  }),
  contentStyle: z.object({
    formats: strs,
    hooks: strs,
    themes: strs,
    fbEngagement: z.object({ medianER: z.number().nullable(), postsPerWeek: z.number().nullable() }),
  }),
  // The campaign LLM1 recommends and the results-header overview; code applies the suggestion only to the settings the
  // client left to the agent (mapLlmBrandProfile). campaignSuggestion is generated before the overview that explains it.
  campaignSuggestion: z.object({ objective: Objective, nCreators: z.number().int(), reasonTh: str }),
  overviewTh: str,
  campaign: z.object({ kpis: strs, formats: strs }),
  creatorRequirements: z.object({
    mustCategories: strs,
    niceCategories: strs,
    desiredTone: strs,
    personaArchetypes: strs,
    followers: z.object({ min: z.number(), max: z.number() }),
    minMedianViews: z.number().nullable(),
    languages: strs,
    dialects: strs,
    excludeKeywords: strs,
    excludeHandles: strs,
    competitorBrands: strs,
    exclusivityWindowDays: z.number().int(),
    brandSafetyLevel: BrandSafetyLevel,
  }),
  matchingQueries: z.object({
    criteria: z.array(z.object({ textTh: str, textEn: str, weight: z.number() })),
    seedHashtags: strs,
    keywordsTh: strs,
    keywordsEn: strs,
  }),
  evidence: z.array(z.object({ ref: str, claim: str, url: str.nullable() })),
  sourcesUnavailable: strs,
  unknowns: strs,
  confidence: z.number(),
});
export type LlmBrandProfile = z.infer<typeof LlmBrandProfile>;

export const LlmQueryPlan = z.object({
  queries: z.array(z.object({ keyword: str, lang: z.enum(['th', 'en']), rationale: str })),
});
export type LlmQueryPlan = z.infer<typeof LlmQueryPlan>;

export const LlmInjectionScreen = z.object({ suspected: z.boolean(), reason: str.nullable() });
export type LlmInjectionScreen = z.infer<typeof LlmInjectionScreen>;

export const LlmEvaluation = z.object({
  rubric: z.array(
    z.object({ criterion: RubricCriterion, score: z.number().int(), evidenceVideoIds: strs, noteTh: str }),
  ),
  suitabilityTier: SuitabilityTier.describe(
    'Brand-safety RISK tier: low = low risk (safe, the normal case), medium = some risky content, high = high risk (sexual content, gambling, dangerous acts, misinformation)',
  ),
  categoryTags: strs,
  toneTags: strs,
  possibleMinor: z.boolean(),
  rationaleTh: str,
});
export type LlmEvaluation = z.infer<typeof LlmEvaluation>;

export const LlmCuratorOutput = z.object({
  whyMatchTh: z.array(z.object({ text: str, evidenceRefs: strs })),
  risksTh: strs,
  // Paragraph shown in the creators table and the side sheet; written after the reasons and risks it summarizes.
  fitSummaryTh: str,
  storyline: z.object({
    conceptTh: str,
    hookTh: str,
    format: z.enum(['in_feed', 'live', 'affiliate', 'series']),
    ctaTh: str,
    sampleCaptionTh: str,
    disclosure: str,
  }),
  pitchAnglesTh: strs,
  topVideoNotes: z.array(z.object({ videoId: str, whyTh: str })),
  playbookText: z.object({
    roleReasonTh: str,
    collaborationNoteTh: str,
    contentAnglesTh: strs,
    briefDosTh: strs,
    briefDontsTh: strs,
    negotiationTh: strs,
    riskMitigations: z.array(z.object({ riskTh: str, mitigationTh: str })),
  }),
});
export type LlmCuratorOutput = z.infer<typeof LlmCuratorOutput>;

export const LlmPortfolioNarrative = z.object({
  headlineTh: str,
  consultantSummaryTh: str,
  mixTh: str,
  nextStepsTh: strs,
});
export type LlmPortfolioNarrative = z.infer<typeof LlmPortfolioNarrative>;

// Form assist (the prompt bar of the new-analysis form): one schema per form section.
export const LlmAudienceAssist = z.object({ personaIds: strs, audienceNotes: str, noteTh: str });
export type LlmAudienceAssist = z.infer<typeof LlmAudienceAssist>;

export const LlmCampaignAssist = z.object({
  objective: Objective,
  budgetMinTHB: z.number().nullable(),
  budgetMaxTHB: z.number().nullable(),
  nCreators: z.number().int(),
  noteTh: str,
});
export type LlmCampaignAssist = z.infer<typeof LlmCampaignAssist>;
