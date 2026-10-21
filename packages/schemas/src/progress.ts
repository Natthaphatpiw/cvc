import { z } from 'zod';
import { Stage } from './common';

export const BrandCard = z.object({
  name: z.string(),
  industry: z.string(),
  oneLinerTh: z.string(),
  toneKeywords: z.array(z.string()),
});
export type BrandCard = z.infer<typeof BrandCard>;

export const KolPreview = z.object({
  creatorId: z.string(),
  handle: z.string(),
  avatarUrl: z.string().nullable(),
  followers: z.number().nullable(),
});
export type KolPreview = z.infer<typeof KolPreview>;

/** Durable progress stream event (§4.11). Never contains transcripts or text read from images. */
export const ProgressEvent = z.object({
  seq: z.number().int().nonnegative(),
  stage: Stage,
  status: z.enum(['started', 'progress', 'completed', 'failed', 'skipped', 'waiting']),
  pct: z.number().min(0).max(100),
  messageTh: z.string(),
  at: z.string(),
  etaSec: z.number().nullable().optional(),
  partial: z
    .object({
      brand: BrandCard.optional(),
      candidatesFound: z.number().int().optional(),
      preview: z.array(KolPreview).optional(),
      warnings: z.array(z.string()).optional(),
      resultId: z.string().optional(),
    })
    .optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEvent>;
export type ProgressEventInput = Omit<ProgressEvent, 'seq' | 'at'>;
