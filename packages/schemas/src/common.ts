import { z } from 'zod';

export const Objective = z.enum(['awareness', 'launch', 'conversion', 'tiktok_shop', 'brand_building', 'ugc']);
export type Objective = z.infer<typeof Objective>;

/** Who set a brief value: the client ('user'), or the agent because the client left it empty ('inferred'). */
export const ValueSource = z.enum(['user', 'inferred']);
export type ValueSource = z.infer<typeof ValueSource>;

export const Tier = z.enum(['nano', 'micro', 'mid', 'macro', 'mega']);
export type Tier = z.infer<typeof Tier>;

export const Channel = z.enum(['web', 'liff']);
export type Channel = z.infer<typeof Channel>;

export const OwnerType = z.enum(['guest', 'line']);
export type OwnerType = z.infer<typeof OwnerType>;

export const Confidence = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof Confidence>;

export const RunStatus = z.enum([
  'queued',
  'normalizing',
  'prefetching',
  'researching_brand',
  'awaiting_review',
  'discovering',
  'evaluating',
  'ranking',
  'curating',
  'completed',
  'partial',
  'failed',
  'cancelled',
]);
export type RunStatus = z.infer<typeof RunStatus>;

export const TERMINAL_STATUSES: readonly RunStatus[] = ['completed', 'partial', 'failed', 'cancelled'];

export const Stage = z.enum(['intake', 'normalize', 'prefetch', 'brand', 'review', 'discover', 'evaluate', 'rank', 'curate', 'done']);
export type Stage = z.infer<typeof Stage>;

export const STAGE_TO_STATUS: Record<Stage, RunStatus> = {
  intake: 'queued',
  normalize: 'normalizing',
  prefetch: 'prefetching',
  brand: 'researching_brand',
  review: 'awaiting_review',
  discover: 'discovering',
  evaluate: 'evaluating',
  rank: 'ranking',
  curate: 'curating',
  done: 'completed',
};

export const EvidenceSourceType = z.enum(['website', 'facebook', 'facebook_ads', 'tiktok', 'youtube', 'instagram', 'web_search', 'pantip', 'kb']);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceType>;

export const ClientSource = z.enum(['website', 'facebook_page', 'facebook_posts', 'facebook_ads', 'instagram', 'tiktok', 'youtube', 'web_search', 'pantip']);
export type ClientSource = z.infer<typeof ClientSource>;

export const AudienceSource = z.enum(['heuristic_comments', 'heuristic_content', 'vendor_modeled', 'tto_authorized', 'accounts_api', 'media_kit']);
export type AudienceSource = z.infer<typeof AudienceSource>;

export const NarrativeStatus = z.enum(['ready', 'pending', 'failed']);
export type NarrativeStatus = z.infer<typeof NarrativeStatus>;

export const BrandSafetyLevel = z.enum(['strict', 'standard', 'relaxed']);
export type BrandSafetyLevel = z.infer<typeof BrandSafetyLevel>;

export const SuitabilityTier = z.enum(['low', 'medium', 'high']);
export type SuitabilityTier = z.infer<typeof SuitabilityTier>;

/** A numeric range with inclusive bounds (THB, counts …). */
export const MinMax = z.object({ min: z.number(), max: z.number() });
export type MinMax = z.infer<typeof MinMax>;

/** p25 / p50 / p75 of an expected value. */
export const KpiRange = z.object({ p25: z.number(), p50: z.number(), p75: z.number() });
export type KpiRange = z.infer<typeof KpiRange>;

export const Uuid = z.string().uuid();
export const IsoDate = z.string();
