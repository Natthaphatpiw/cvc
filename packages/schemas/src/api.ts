import { z } from 'zod';
import { GroupWeights } from './evaluation';
import { FinalResult } from './result';
import { MinMax, Objective, RunStatus, Stage } from './common';
import { AudiencePersona } from './input';
import { ProgressEvent } from './progress';
import { Category } from './ref';

/** Uniform error body for every endpoint. */
export const ApiError = z.object({ error: z.object({ code: z.string(), messageTh: z.string(), details: z.unknown().optional() }) });
export type ApiError = z.infer<typeof ApiError>;

// ---------- agent ----------
export const CreateRunResponse = z.object({
  runId: z.string(),
  status: RunStatus,
  /** only for guests: keep in IndexedDB to claim the run after LINE login */
  claimSecret: z.string().nullable(),
  deduped: z.boolean(),
});
export type CreateRunResponse = z.infer<typeof CreateRunResponse>;

export const RunStatusResponse = z.object({
  runId: z.string(),
  status: RunStatus,
  stage: Stage.nullable(),
  progressPct: z.number(),
  warnings: z.array(z.string()),
  resultId: z.string().nullable(),
  etaSec: z.number().nullable(),
  createdAt: z.string(),
  companyName: z.string(),
  errorMessageTh: z.string().nullable(),
});
export type RunStatusResponse = z.infer<typeof RunStatusResponse>;

/** Polling fallback for the progress timeline: GET /api/agent/runs/:id/events?after=<seq> */
export const RunEventsResponse = z.object({ events: z.array(ProgressEvent), nextSeq: z.number().int() });
export type RunEventsResponse = z.infer<typeof RunEventsResponse>;

export const TranscribeRequest = z.object({ assetPathname: z.string() });
export const TranscribeResponse = z.object({ transcript: z.string(), durationS: z.number().nullable() });
export type TranscribeResponse = z.infer<typeof TranscribeResponse>;

/**
 * POST /api/agent/assist: the form's AI prompt bar. The planner describes a need in Thai and the agent fills one form
 * section (audience or campaign) for them to edit before submitting. The company fields are context only.
 */
export const AssistSection = z.enum(['audience', 'campaign']);
export type AssistSection = z.infer<typeof AssistSection>;
export const AssistRequest = z.object({
  section: AssistSection,
  promptTh: z.string().trim().min(2).max(500),
  companyName: z.string().trim().max(200).nullable().default(null),
  websiteUrl: z.string().trim().max(500).nullable().default(null),
  facebookUrl: z.string().trim().max(500).nullable().default(null),
});
export type AssistRequest = z.infer<typeof AssistRequest>;
export type AssistRequestInput = z.input<typeof AssistRequest>;

/** Same limits as RunInput, so a suggestion drops straight into the form. personaIds are ids from the persona catalog. */
export const AudienceAssist = z.object({ personaIds: z.array(z.string()).max(10), audienceNotes: z.string().max(2000) });
export type AudienceAssist = z.infer<typeof AudienceAssist>;
/** budgetTHB is null unless the planner mentioned an amount of money. */
export const CampaignAssist = z.object({ objective: Objective, budgetTHB: MinMax.nullable(), nCreators: z.number().int().min(1).max(10) });
export type CampaignAssist = z.infer<typeof CampaignAssist>;

/** noteTh: one short Thai sentence explaining the suggestion. */
export const AudienceAssistResponse = z.object({ section: z.literal('audience'), audience: AudienceAssist, noteTh: z.string() });
export type AudienceAssistResponse = z.infer<typeof AudienceAssistResponse>;
export const CampaignAssistResponse = z.object({ section: z.literal('campaign'), campaign: CampaignAssist, noteTh: z.string() });
export type CampaignAssistResponse = z.infer<typeof CampaignAssistResponse>;
export const AssistResponse = z.discriminatedUnion('section', [AudienceAssistResponse, CampaignAssistResponse]);
export type AssistResponse = z.infer<typeof AssistResponse>;

export const RescoreRequest = z.object({
  weights: GroupWeights.optional(),
  preset: Objective.optional(),
  save: z.boolean().default(false),
});
export type RescoreRequest = z.infer<typeof RescoreRequest>;
export const RescoreResponse = z.object({ result: FinalResult, saved: z.boolean() });
export type RescoreResponse = z.infer<typeof RescoreResponse>;

export const FeedbackRequest = z.object({
  creatorId: z.string().nullable(),
  kind: z.enum(['thumbs_up', 'thumbs_down', 'shortlisted', 'rejected', 'contacted', 'booked']),
  reason: z.string().max(500).nullable().default(null),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;

export const ChatSessionResponse = z.object({
  sessionId: z.string(),
  sessionNo: z.number().int(),
  researchCallsLeft: z.number().int(),
  messages: z.array(z.unknown()),
});
export type ChatSessionResponse = z.infer<typeof ChatSessionResponse>;

// ---------- api ----------
export const GuestSessionRequest = z.object({ noticeVersion: z.string() });
export const SessionTokens = z.object({ accessToken: z.string(), refreshToken: z.string(), expiresAt: z.number() });
export type SessionTokens = z.infer<typeof SessionTokens>;

export const MeResponse = z.object({
  userId: z.string(),
  isAnonymous: z.boolean(),
  displayName: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  role: z.enum(['member', 'planner', 'admin']),
  isOaFriend: z.boolean(),
  pushOptIn: z.boolean(),
  needsNoticeAck: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const ConsentRequest = z.object({
  consentType: z.enum(['privacy_notice_ack', 'push_notification', 'marketing']),
  version: z.string(),
  granted: z.boolean(),
});

export const ClaimRequest = z.object({ items: z.array(z.object({ runId: z.string(), claimSecret: z.string() })).max(50) });
export const ClaimResponse = z.object({ claimed: z.number().int() });

/** api → agent POST /api/agent/internal/claim-runs: the api hashes the secrets, the agent never sees them. */
export const ClaimRunsInternalRequest = z.object({
  userId: z.string().uuid(),
  items: z
    .array(z.object({ runId: z.string(), claimSecretHash: z.string().regex(/^[0-9a-f]{64}$/) }))
    .max(50),
});
export type ClaimRunsInternalRequest = z.infer<typeof ClaimRunsInternalRequest>;

/** api → agent POST /api/agent/internal/purge-user (PDPA delete). */
export const PurgeUserRequest = z.object({ userId: z.string().uuid() });
export const PurgeUserResponse = z.object({ runs: z.number().int(), chatThreads: z.number().int() });
export type PurgeUserResponse = z.infer<typeof PurgeUserResponse>;

export const PersonasResponse = z.object({ personas: z.array(AudiencePersona) });
export type PersonasResponse = z.infer<typeof PersonasResponse>;
export const CategoriesResponse = z.object({ categories: z.array(Category) });
export type CategoriesResponse = z.infer<typeof CategoriesResponse>;

/** GET /api/health and /api/agent/health — which integrations are configured (never the values). */
export const HealthResponse = z.object({
  service: z.enum(['api', 'agent']),
  ok: z.boolean(),
  demo: z.boolean(),
  configured: z.record(z.string(), z.boolean()),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const HistoryItem = z.object({
  runId: z.string(),
  status: RunStatus,
  channel: z.enum(['web', 'liff']),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  resultId: z.string().nullable(),
  brandName: z.string().nullable(),
  isPartial: z.boolean().nullable(),
  expiresAt: z.string().nullable(),
  version: z.number().int().nullable(),
  brandLogoUrl: z.string().nullable(),
  top3: z.array(z.object({ handle: z.string(), avatarUrl: z.string().nullable(), score: z.number().nullable() })).nullable(),
});
export type HistoryItem = z.infer<typeof HistoryItem>;
export const HistoryResponse = z.object({ items: z.array(HistoryItem), nextCursor: z.string().nullable() });
export type HistoryResponse = z.infer<typeof HistoryResponse>;

export const SavedResult = z.object({
  id: z.string(),
  resultId: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  tags: z.array(z.string()),
  isPinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedResult = z.infer<typeof SavedResult>;
export const SaveResultRequest = z.object({
  resultId: z.string(),
  title: z.string().min(1).max(200),
  note: z.string().max(2000).nullable().default(null),
  tags: z.array(z.string()).max(10).default([]),
});
export const UpdateSavedRequest = z.object({
  title: z.string().min(1).max(200).optional(),
  note: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string()).max(10).optional(),
  isPinned: z.boolean().optional(),
});

export const CreateShareRequest = z.object({ expiresInDays: z.union([z.literal(7), z.literal(30)]) });
export const ShareLink = z.object({ id: z.string(), url: z.string(), expiresAt: z.string(), viewCount: z.number().int(), revokedAt: z.string().nullable() });
export type ShareLink = z.infer<typeof ShareLink>;
