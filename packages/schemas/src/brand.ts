import { z } from 'zod';
import { BrandSafetyLevel, ClientSource, MinMax, Objective, Tier, ValueSource } from './common';

/** Quarantined summarizer output per client source (§4.4 step B). Stored in analysis.client_snapshots.evidence_card. */
export const EvidenceCard = z.object({
  source: ClientSource,
  sourceUrl: z.string().nullable(),
  products: z.array(z.object({ name: z.string(), priceTHB: z.number().nullable(), notes: z.string().nullable() })),
  usp: z.array(z.string()),
  tone: z.array(z.string()),
  priceTier: z.enum(['mass', 'masstige', 'premium', 'luxury', 'unknown']),
  audienceCues: z.array(z.string()),
  claims: z.array(z.object({ text: z.string(), sourceRef: z.string() })),
  stats: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
});
export type EvidenceCard = z.infer<typeof EvidenceCard>;

export const AudienceSegment = z.object({
  label: z.string(),
  ageDist: z.record(z.string(), z.number()),
  genderDist: z.record(z.string(), z.number()),
  regionDist: z.record(z.string(), z.number()),
  interests: z.array(z.string()),
  painPoints: z.array(z.string()),
  purchaseDrivers: z.array(z.string()),
});
export type AudienceSegment = z.infer<typeof AudienceSegment>;

export const MatchingCriterion = z.object({
  id: z.string(),
  textTh: z.string(),
  textEn: z.string(),
  weight: z.number().min(0).max(1),
});
export type MatchingCriterion = z.infer<typeof MatchingCriterion>;

export const BrandEvidence = z.object({ ref: z.string(), claim: z.string(), url: z.string(), retrievedAt: z.string() });
export type BrandEvidence = z.infer<typeof BrandEvidence>;

/** LLM1 output (§4.4). */
export const BrandProfile = z.object({
  schemaVersion: z.literal('1.0'),
  brand: z.object({
    name: z.string(),
    website: z.string().nullable(),
    facebookUrl: z.string().nullable(),
    tiktokHandle: z.string().nullable(),
    industryId: z.string(),
    subCategories: z.array(z.string()),
    products: z.array(
      z.object({
        name: z.string(),
        categoryId: z.string().nullable(),
        priceBandTHB: z.tuple([z.number(), z.number()]).nullable(),
        keyBenefits: z.array(z.string()),
        usp: z.string().nullable(),
      }),
    ),
    pricePositioning: z.enum(['mass', 'masstige', 'premium', 'luxury']),
    personality: z.object({ toneKeywords: z.array(z.string()), formality: z.number(), humor: z.number(), energy: z.number() }),
    languageStyle: z.object({ primary: z.string(), englishMix: z.boolean(), register: z.enum(['casual', 'polite', 'formal']) }),
    contentPillars: z.array(z.string()),
    visualStyle: z.array(z.string()),
    regulatedCategory: z.enum(['none', 'cosmetics', 'supplement', 'alcohol', 'finance', 'medical']),
  }),
  /** 3-4 Thai sentences for the results header: what the brand sells, who it serves, its content style and tone. */
  overviewTh: z.string().default(''),
  audience: z.object({
    segments: z.array(AudienceSegment).min(1),
    source: z.enum(['user_selected', 'inferred', 'mixed']),
    confidence: z.number().min(0).max(1),
  }),
  contentStyle: z.object({
    formats: z.array(z.string()),
    hooks: z.array(z.string()),
    themes: z.array(z.string()),
    fbEngagement: z.object({ medianER: z.number().nullable(), postsPerWeek: z.number().nullable() }),
  }),
  campaign: z.object({
    objective: Objective,
    objectiveSource: ValueSource.default('user'),
    /** why LLM1 suggested the objective; empty when the client chose it */
    objectiveReasonTh: z.string().default(''),
    kpis: z.array(z.string()),
    budgetTHB: MinMax.nullable(),
    nCreators: z.number().int(),
    nCreatorsSource: ValueSource.default('user'),
    preferredTiers: z.array(Tier),
    formats: z.array(z.string()),
  }),
  creatorRequirements: z.object({
    mustCategories: z.array(z.string()),
    niceCategories: z.array(z.string()),
    desiredTone: z.array(z.string()),
    personaArchetypes: z.array(z.string()),
    followers: MinMax,
    minMedianViews: z.number().nullable(),
    languages: z.array(z.string()),
    dialects: z.array(z.string()),
    excludeKeywords: z.array(z.string()),
    excludeHandles: z.array(z.string()),
    competitorBrands: z.array(z.string()),
    exclusivityWindowDays: z.number().int(),
    brandSafetyLevel: BrandSafetyLevel,
    allowMinors: z.boolean(),
  }),
  matchingQueries: z.object({
    criteria: z.array(MatchingCriterion).min(1),
    seedHashtags: z.array(z.string()),
    keywordsTh: z.array(z.string()),
    keywordsEn: z.array(z.string()),
  }),
  scoringPreset: Objective,
  evidence: z.array(BrandEvidence),
  sourcesUnavailable: z.array(z.string()),
  unknowns: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type BrandProfile = z.infer<typeof BrandProfile>;
