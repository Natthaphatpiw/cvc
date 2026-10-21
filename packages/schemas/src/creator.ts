import { z } from 'zod';
import { AudienceSource, Confidence, SuitabilityTier, Tier } from './common';

/** Typed discovery hit — never carries bio/caption text into the scout agent (§4.5). */
export const CandidateRef = z.object({
  platformUserId: z.string(),
  handle: z.string(),
  followers: z.number().nullable(),
  region: z.string().nullable(),
  videoCount: z.number().nullable(),
  lastPostedAt: z.string().nullable(),
  matchedQuery: z.string(),
  avatarSourceUrl: z.string().nullable(),
});
export type CandidateRef = z.infer<typeof CandidateRef>;

export const CreatorProfile = z.object({
  platform: z.literal('tiktok'),
  platformUserId: z.string(),
  handle: z.string(),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  bioLink: z.string().nullable(),
  avatarSourceUrl: z.string().nullable(),
  isVerified: z.boolean().nullable(),
  region: z.string().nullable(),
  language: z.string().nullable(),
  isShopSeller: z.boolean().nullable(),
  isCommerceUser: z.boolean().nullable(),
  followerCount: z.number().nullable(),
  followingCount: z.number().nullable(),
  likesCount: z.number().nullable(),
  videoCount: z.number().nullable(),
});
export type CreatorProfile = z.infer<typeof CreatorProfile>;

export const CreatorVideo = z.object({
  platformVideoId: z.string(),
  url: z.string(),
  postedAt: z.string().nullable(),
  caption: z.string().nullable(),
  hashtags: z.array(z.string()),
  durationS: z.number().nullable(),
  views: z.number().nullable(),
  likes: z.number().nullable(),
  comments: z.number().nullable(),
  shares: z.number().nullable(),
  saves: z.number().nullable(),
  isSponsored: z.boolean().nullable(),
  isAd: z.boolean().nullable(),
  hasShopProduct: z.boolean().nullable(),
  locationCreated: z.string().nullable(),
  textLanguage: z.string().nullable(),
  coverSourceUrl: z.string().nullable(),
});
export type CreatorVideo = z.infer<typeof CreatorVideo>;

export const AudienceEstimate = z.object({
  source: AudienceSource,
  countryDist: z.record(z.string(), z.number()).nullable(),
  ageDist: z.record(z.string(), z.number()).nullable(),
  genderDist: z.record(z.string(), z.number()).nullable(),
  regionDist: z.record(z.string(), z.number()).nullable(),
  thaiShare: z.number().nullable(),
  sampleSize: z.number().int().nullable(),
  ci95: z.tuple([z.number(), z.number()]).nullable(),
  confidence: Confidence,
  /** aggregate-only comment signals (no commenter identities). */
  commentSignals: z
    .object({ botLikeShare: z.number(), buyIntentShare: z.number(), maleParticleShare: z.number().nullable() })
    .nullable(),
});
export type AudienceEstimate = z.infer<typeof AudienceEstimate>;

/** Computed metrics over the last ≤20 eligible videos (code, never LLM). */
export const CreatorMetrics = z.object({
  videosAnalyzed: z.number().int(),
  medianViews: z.number().nullable(),
  p25Views: z.number().nullable(),
  p75Views: z.number().nullable(),
  erViewsMedian: z.number().nullable(),
  postsPerWeek: z.number().nullable(),
  viewsCv: z.number().nullable(),
  lastPostedAt: z.string().nullable(),
  sponsoredCount: z.number().int(),
  sponsoredShare: z.number().nullable(),
  erSponsored: z.number().nullable(),
  erOrganic: z.number().nullable(),
  medianViewsSponsored: z.number().nullable(),
  medianViewsOrganic: z.number().nullable(),
  followerGrowth30d: z.number().nullable(),
  /** weekday 0..6 (Mon=0) × hour 0..23 median views where n ≥ 2 */
  bestDays: z.array(z.number().int()),
  bestHours: z.array(z.number().int()),
});
export type CreatorMetrics = z.infer<typeof CreatorMetrics>;

/** Everything the evaluator and scorer see about one creator (stored in analysis.candidates.dossier_snapshot). */
export const CreatorDossier = z.object({
  creatorId: z.string(),
  profile: CreatorProfile,
  tier: Tier.nullable(),
  avatarUrl: z.string().nullable(),
  videos: z.array(CreatorVideo),
  metrics: CreatorMetrics,
  audience: AudienceEstimate.nullable(),
  collabs: z.array(z.object({ brandName: z.string(), detectedVia: z.string(), detectedAt: z.string() })),
  categories: z.array(z.string()),
  suitabilityTier: SuitabilityTier.nullable(),
  fetchedAt: z.string(),
});
export type CreatorDossier = z.infer<typeof CreatorDossier>;
