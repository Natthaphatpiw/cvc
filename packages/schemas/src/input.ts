import { z } from 'zod';
import { Channel, MinMax, Objective, Tier, ValueSource } from './common';

/** Voice note transcribed before submit (POST /api/agent/transcribe), possibly edited by the user. */
export const VoiceTranscript = z.object({
  assetPathname: z.string(),
  text: z.string().max(8000),
  userEdited: z.boolean(),
});
export type VoiceTranscript = z.infer<typeof VoiceTranscript>;

export const RunAsset = z.object({
  pathname: z.string().regex(/^uploads\//, 'must be under uploads/'),
  kind: z.enum(['screenshot', 'image', 'voice', 'document']),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});
export type RunAsset = z.infer<typeof RunAsset>;

/** objective / nCreators null = the client left it to the agent (resolved in the brand step from LLM1's suggestion). */
export const CampaignInput = z.object({
  objective: Objective.nullable().default('conversion'),
  budgetTHB: MinMax.nullable().default(null),
  nCreators: z.number().int().min(1).max(10).nullable().default(5),
  preferredTiers: z.array(Tier).default([]),
});
export type CampaignInput = z.infer<typeof CampaignInput>;

/** What the client sends to POST /api/agent/runs. Only companyName is required (§4.2). */
export const RunInput = z.object({
  companyName: z.string().trim().min(1).max(200),
  websiteUrl: z.string().url().nullable().default(null),
  facebookUrl: z.string().url().nullable().default(null),
  tiktokUrl: z.string().url().nullable().default(null),
  youtubeUrl: z.string().url().nullable().default(null),
  instagramUrl: z.string().url().nullable().default(null),
  personaIds: z.array(z.string()).max(10).default([]),
  audienceNotes: z.string().max(2000).nullable().default(null),
  assets: z.array(RunAsset).max(13).default([]),
  voiceTranscripts: z.array(VoiceTranscript).max(3).default([]),
  campaign: CampaignInput.default({ objective: 'conversion', budgetTHB: null, nCreators: 5, preferredTiers: [] }),
  exclusions: z
    .object({ competitors: z.array(z.string()).default([]), handles: z.array(z.string()).default([]) })
    .default({ competitors: [], handles: [] }),
  options: z.object({ reviewBrand: z.boolean().default(false), force: z.boolean().default(false) }).default({ reviewBrand: false, force: false }),
  channel: Channel.default('web'),
  noticeVersion: z.string().min(1),
});
export type RunInput = z.infer<typeof RunInput>;
export type RunInputDraft = z.input<typeof RunInput>;

export const ImageFinding = z.object({
  assetPathname: z.string(),
  type: z.enum(['fb_page', 'tiktok_profile', 'product', 'brief', 'other']),
  facts: z.array(z.string()),
});
export type ImageFinding = z.infer<typeof ImageFinding>;

/** LLM0 output: the normalized brief (§4.3). Stored in analysis.runs.normalized_input. */
export const InputBrief = z.object({
  company: z.object({ name: z.string(), nameTh: z.string().nullable(), aliases: z.array(z.string()) }),
  urls: z.object({
    website: z.string().nullable(),
    facebook: z.string().nullable(),
    tiktok: z.string().nullable(),
    youtube: z.string().nullable(),
    instagram: z.string().nullable(),
    others: z.array(z.string()),
  }),
  targetAudience: z.object({
    personaIds: z.array(z.string()),
    freeText: z.string().nullable(),
    fromVoice: z.string().nullable(),
    fromImages: z.string().nullable(),
  }),
  /**
   * A value the client left empty has source 'inferred' and holds a placeholder ('conversion' / 5) until the brand
   * step writes the resolved value back.
   */
  campaign: z.object({
    objective: Objective,
    objectiveSource: ValueSource.default('user'),
    budgetTHB: MinMax.nullable(),
    nCreators: z.number().int(),
    nCreatorsSource: ValueSource.default('user'),
    preferredTiers: z.array(Tier),
  }),
  constraints: z.object({ competitors: z.array(z.string()), excludeHandles: z.array(z.string()), mustInclude: z.array(z.string()) }),
  imageFindings: z.array(ImageFinding),
  voiceTranscript: z.string().nullable(),
  missingFields: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type InputBrief = z.infer<typeof InputBrief>;

export const AudiencePersona = z.object({
  id: z.string(),
  labelTh: z.string(),
  labelEn: z.string(),
  descriptionTh: z.string().nullable(),
  ageDist: z.record(z.string(), z.number()),
  genderDist: z.record(z.string(), z.number()),
  regionDist: z.record(z.string(), z.number()).nullable(),
  interests: z.array(z.string()),
  categoryHints: z.array(z.string()),
});
export type AudiencePersona = z.infer<typeof AudiencePersona>;
