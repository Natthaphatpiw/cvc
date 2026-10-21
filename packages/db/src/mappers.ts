/**
 * The single place where database rows (snake_case, postgres.js value types) map to and from the camelCase
 * contracts of @cvc/schemas. Store implementations never touch column names outside SQL text and this file.
 */
import {
  Category,
  Channel,
  CreatorDossier,
  KolEvaluation,
  MinMax,
  OwnerType,
  RankedCreator,
  RunInput,
  RunStatus,
  Stage,
  Tier,
  type AudiencePersona,
  type CandidateRef,
  type ClientSource,
  type CreatorProfile,
  type CreatorVideo,
  type EvidenceSourceType,
  type HistoryItem,
  type KpiBenchmark,
  type MeResponse,
  type RateCard,
  type SavedResult,
  type TierBand,
  type TierBenchmark,
} from '@cvc/schemas';
import type { CandidateRow, CandidateStatus, ChatSessionRecord, RunPatch, RunRecord, UpdateSavedPatch } from './types';
import { cleanHandle, toInt, toIso, toIsoOrNull, toNum } from './util';

type Nullable<T> = T | null;
type Timestamp = Date | string;

/** Parse with a zod enum/schema, falling back when the stored value drifted. */
function pick<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, v: unknown, fallback: T): T {
  const r = schema.safeParse(v);
  return r.success ? r.data : fallback;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// ---------------------------------------------------------------------------------------------
// analysis.runs
// ---------------------------------------------------------------------------------------------

export type RunRow = {
  id: string;
  owner_id: string;
  owner_type: string;
  channel: string;
  status: string;
  stage: Nullable<string>;
  progress_pct: number;
  warnings: Nullable<string[]>;
  raw_input: unknown;
  input_hash: string;
  normalized_input: unknown;
  model_config: unknown;
  error_message: Nullable<string>;
  workflow_run_id: Nullable<string>;
  cost_usd: string | number;
  created_at: Timestamp;
  updated_at: Timestamp;
  completed_at: Nullable<Timestamp>;
  brand_profile_id: Nullable<string>;
  result_id: Nullable<string>;
};

/** runs.model_config carries runtime flags that have no column of their own. */
export type RunModelConfig = { isDemo?: boolean };

export function runFromRow(row: RunRow): RunRecord {
  const parsedInput = RunInput.safeParse(row.raw_input);
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerType: pick(OwnerType, row.owner_type, 'guest'),
    channel: pick(Channel, row.channel, 'web'),
    status: pick(RunStatus, row.status, 'failed'),
    stage: row.stage === null ? null : pick<Stage | null>(Stage, row.stage, null),
    progressPct: Number(row.progress_pct),
    warnings: row.warnings ?? [],
    input: parsedInput.success ? parsedInput.data : (row.raw_input as RunInput),
    inputHash: row.input_hash,
    normalizedInput: (row.normalized_input ?? null) as RunRecord['normalizedInput'],
    brandProfileId: row.brand_profile_id,
    resultId: row.result_id,
    errorMessageTh: row.error_message,
    isDemo: asRecord(row.model_config)?.['isDemo'] === true,
    workflowRunId: row.workflow_run_id,
    costUsd: toNum(row.cost_usd) ?? 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    completedAt: toIsoOrNull(row.completed_at),
  };
}

export const clampPct = (n: number): number => Math.min(100, Math.max(0, Math.round(n)));

/** Column values for an UPDATE of analysis.runs. JSON columns are returned separately (they need sql.json). */
export function runPatchColumns(patch: RunPatch): { columns: Record<string, string | number | string[] | null>; normalizedInput?: unknown } {
  const columns: Record<string, string | number | string[] | null> = {};
  if (patch.status !== undefined) columns['status'] = patch.status;
  if (patch.stage !== undefined) columns['stage'] = patch.stage;
  if (patch.progressPct !== undefined) columns['progress_pct'] = clampPct(patch.progressPct);
  if (patch.warnings !== undefined) columns['warnings'] = patch.warnings;
  if (patch.errorMessageTh !== undefined) columns['error_message'] = patch.errorMessageTh;
  if (patch.workflowRunId !== undefined) columns['workflow_run_id'] = patch.workflowRunId;
  if (patch.costUsd !== undefined) columns['cost_usd'] = patch.costUsd;
  if (patch.completedAt !== undefined) columns['completed_at'] = patch.completedAt;
  return patch.normalizedInput !== undefined ? { columns, normalizedInput: patch.normalizedInput } : { columns };
}

// ---------------------------------------------------------------------------------------------
// analysis.candidates
// ---------------------------------------------------------------------------------------------

const CANDIDATE_STATUS_TO_DB: Record<CandidateStatus, string> = {
  discovered: 'candidate',
  enriched: 'enriched',
  evaluated: 'evaluated',
  excluded: 'excluded',
  ranked: 'ranked',
};

function candidateStatusFromDb(s: string): CandidateStatus {
  switch (s) {
    case 'enriched':
    case 'evaluated':
    case 'excluded':
    case 'ranked':
      return s;
    case 'not_evaluated':
      return 'enriched';
    default:
      return 'discovered';
  }
}

/**
 * Fields of CandidateRow without a column of their own live in the existing JSON columns:
 * dossier_snapshot = { candidateRef, dossier } and sub_scores = { ranked, semantic, estFeeTHB }.
 */
type DossierSnapshotJson = { candidateRef: CandidateRef; dossier: CreatorDossier | null };
type SubScoresJson = { ranked: RankedCreator | null; semantic: number | null; estFeeTHB: MinMax | null };

export type CandidateDbRow = {
  creator_id: string;
  handle: string;
  status: string;
  discovered_via: string[];
  gate_failures: string[];
  dossier_snapshot: unknown;
  evaluation: unknown;
  suspected_injection: boolean;
  sub_scores: unknown;
  // creator columns used when the snapshot lacks a candidateRef
  platform_user_id: string;
  follower_count: Nullable<string>;
  country_code: Nullable<string>;
  video_count: Nullable<number>;
  last_posted_at: Nullable<Timestamp>;
  avatar_source_url: Nullable<string>;
};

export function candidateToDb(runId: string, c: CandidateRow): {
  run_id: string;
  creator_id: string;
  discovered_via: string[];
  gate_failures: string[];
  dossier_snapshot: DossierSnapshotJson;
  evaluation: KolEvaluation | null;
  suspected_injection: boolean;
  sub_scores: SubScoresJson;
  missing_features: string[];
  final_score: number | null;
  rank: number | null;
  rank_stability: number | null;
  data_confidence: number | null;
  status: string;
} {
  return {
    run_id: runId,
    creator_id: c.creatorId,
    discovered_via: c.candidateRef.matchedQuery ? [c.candidateRef.matchedQuery] : [],
    gate_failures: c.gateFailures,
    dossier_snapshot: { candidateRef: c.candidateRef, dossier: c.dossier },
    evaluation: c.evaluation,
    suspected_injection: c.suspectedInjection,
    sub_scores: { ranked: c.ranked, semantic: c.semantic, estFeeTHB: c.estFeeTHB },
    missing_features: c.ranked?.missingFeatures ?? [],
    final_score: c.ranked?.total ?? null,
    rank: c.ranked?.rank ?? null,
    rank_stability: c.ranked?.rankStability ?? null,
    data_confidence: c.ranked?.dataConfidence ?? null,
    status: CANDIDATE_STATUS_TO_DB[c.status],
  };
}

export function candidateFromDb(row: CandidateDbRow): CandidateRow {
  const snap = asRecord(row.dossier_snapshot);
  const subs = asRecord(row.sub_scores);
  const dossierRaw = snap && 'dossier' in snap ? snap['dossier'] : snap && 'profile' in snap ? snap : null;
  const dossier = dossierRaw ? CreatorDossier.safeParse(dossierRaw) : null;
  const evaluation = row.evaluation ? KolEvaluation.safeParse(row.evaluation) : null;
  const ranked = subs?.['ranked'] ? RankedCreator.safeParse(subs['ranked']) : null;
  const fee = subs?.['estFeeTHB'] ? MinMax.safeParse(subs['estFeeTHB']) : null;
  const semantic = subs?.['semantic'];
  const ref = asRecord(snap?.['candidateRef']) as CandidateRef | null;
  return {
    creatorId: row.creator_id,
    handle: row.handle,
    status: candidateStatusFromDb(row.status),
    candidateRef: ref ?? {
      platformUserId: row.platform_user_id,
      handle: row.handle,
      followers: toNum(row.follower_count),
      region: row.country_code,
      videoCount: row.video_count,
      lastPostedAt: toIsoOrNull(row.last_posted_at),
      matchedQuery: row.discovered_via[0] ?? '',
      avatarSourceUrl: row.avatar_source_url,
    },
    dossier: dossier?.success ? dossier.data : null,
    evaluation: evaluation?.success ? evaluation.data : null,
    ranked: ranked?.success ? ranked.data : null,
    gateFailures: row.gate_failures ?? [],
    suspectedInjection: row.suspected_injection,
    estFeeTHB: fee?.success ? fee.data : null,
    semantic: typeof semantic === 'number' ? semantic : null,
  };
}

// ---------------------------------------------------------------------------------------------
// kol.creators / kol.creator_videos
// ---------------------------------------------------------------------------------------------

export function creatorToDb(p: CreatorProfile, a: { tier: Tier | null; avatarUrl: string | null; isDemo: boolean }) {
  return {
    platform: 'tiktok' as const,
    platform_user_id: p.platformUserId,
    handle: cleanHandle(p.handle),
    display_name: p.displayName,
    bio: p.bio,
    bio_link: p.bioLink,
    avatar_url: a.avatarUrl,
    avatar_source_url: p.avatarSourceUrl,
    is_verified: p.isVerified,
    country_code: p.region ? p.region.toUpperCase() : null,
    primary_language: p.language,
    is_shop_seller: p.isShopSeller,
    is_commerce_user: p.isCommerceUser,
    follower_count: toInt(p.followerCount),
    following_count: toInt(p.followingCount),
    likes_count: toInt(p.likesCount),
    video_count: toInt(p.videoCount),
    tier: a.tier,
    // fictional (mock provider) creators are tagged so they can be told apart and purged
    data_sources: [a.isDemo ? 'demo' : 'provider'],
  };
}

export function videoToDb(creatorId: string, v: CreatorVideo, coverUrl: string | null) {
  return {
    creator_id: creatorId,
    platform_video_id: v.platformVideoId,
    url: v.url,
    posted_at: v.postedAt,
    caption: v.caption,
    hashtags: v.hashtags,
    duration_s: toInt(v.durationS),
    views: toInt(v.views),
    likes: toInt(v.likes),
    comments: toInt(v.comments),
    shares: toInt(v.shares),
    saves: toInt(v.saves),
    is_sponsored: v.isSponsored,
    is_ad: v.isAd,
    has_shop_product: v.hasShopProduct,
    location_created: v.locationCreated,
    text_language: v.textLanguage,
    cover_url: coverUrl,
    cover_source_url: v.coverSourceUrl,
  };
}

// ---------------------------------------------------------------------------------------------
// evidence
// ---------------------------------------------------------------------------------------------

const EVIDENCE_SOURCE: Record<ClientSource, EvidenceSourceType> = {
  website: 'website',
  facebook_page: 'facebook',
  facebook_posts: 'facebook',
  facebook_ads: 'facebook_ads',
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  web_search: 'web_search',
  pantip: 'pantip',
};

export const evidenceSourceType = (s: ClientSource): EvidenceSourceType => EVIDENCE_SOURCE[s];

// ---------------------------------------------------------------------------------------------
// analysis.chat_sessions
// ---------------------------------------------------------------------------------------------

export type ChatSessionRow = {
  id: string;
  result_id: string;
  owner_id: string;
  session_no: number;
  mastra_thread_id: string;
  research_calls: number;
  created_at: Timestamp;
};

export function chatSessionFromRow(r: ChatSessionRow): ChatSessionRecord {
  return {
    id: r.id,
    resultId: r.result_id,
    ownerId: r.owner_id,
    sessionNo: r.session_no,
    threadId: r.mastra_thread_id,
    researchCallsUsed: r.research_calls,
    createdAt: toIso(r.created_at),
  };
}

export const chatThreadId = (resultId: string, sessionNo: number): string => `res_${resultId}_s${sessionNo}`;
export const chatResourceId = (resultId: string): string => `result:${resultId}`;

// ---------------------------------------------------------------------------------------------
// ref.*
// ---------------------------------------------------------------------------------------------

export type PersonaRow = {
  id: string;
  label_th: string;
  label_en: string;
  description_th: Nullable<string>;
  age_dist: Record<string, number>;
  gender_dist: Record<string, number>;
  region_dist: Nullable<Record<string, number>>;
  interests: string[];
  category_hints: string[];
};

export function personaFromRow(r: PersonaRow): AudiencePersona {
  return {
    id: r.id,
    labelTh: r.label_th,
    labelEn: r.label_en,
    descriptionTh: r.description_th,
    ageDist: r.age_dist,
    genderDist: r.gender_dist,
    regionDist: r.region_dist,
    interests: r.interests,
    categoryHints: r.category_hints,
  };
}

export type CategoryRow = {
  id: string;
  parent_id: Nullable<string>;
  label_th: string;
  label_en: string;
  tiktok_bc_policy: string;
  niche_multiplier: string | number;
};

export function categoryFromRow(r: CategoryRow): Category {
  return Category.parse({
    id: r.id,
    parentId: r.parent_id,
    labelTh: r.label_th,
    labelEn: r.label_en,
    tiktokBcPolicy: r.tiktok_bc_policy,
    nicheMultiplier: toNum(r.niche_multiplier) ?? 1,
  });
}

export type TierBandRow = { tier: string; min_followers: string | number; max_followers: Nullable<string | number> };
export const tierBandFromRow = (r: TierBandRow): TierBand => ({
  tier: pick(Tier, r.tier, 'nano'),
  minFollowers: toNum(r.min_followers) ?? 0,
  maxFollowers: toNum(r.max_followers),
});

export type RateCardRow = {
  tier: string;
  category_id: Nullable<string>;
  format: string;
  fee_min_thb: number;
  fee_max_thb: number;
  source: string;
};
export const rateCardFromRow = (r: RateCardRow): RateCard => ({
  tier: pick(Tier, r.tier, 'nano'),
  categoryId: r.category_id,
  format: r.format as RateCard['format'],
  feeMinTHB: r.fee_min_thb,
  feeMaxTHB: r.fee_max_thb,
  source: r.source,
});

type PercentileCols = { p25: string | number; p50: string | number; p75: string | number };
const percentiles = (r: PercentileCols) => ({ p25: toNum(r.p25) ?? 0, p50: toNum(r.p50) ?? 0, p75: toNum(r.p75) ?? 0 });

export type TierBenchmarkRow = PercentileCols & { tier: string; category_id: Nullable<string>; metric: string; source: string };
export const tierBenchmarkFromRow = (r: TierBenchmarkRow): TierBenchmark => ({
  tier: pick(Tier, r.tier, 'nano'),
  categoryId: r.category_id,
  metric: r.metric as TierBenchmark['metric'],
  ...percentiles(r),
  source: r.source,
});

export type KpiBenchmarkRow = PercentileCols & {
  objective: Nullable<string>;
  category_id: Nullable<string>;
  tier: Nullable<string>;
  metric: string;
  source: string;
  note_th: Nullable<string>;
};
export const kpiBenchmarkFromRow = (r: KpiBenchmarkRow): KpiBenchmark => ({
  objective: r.objective as KpiBenchmark['objective'],
  categoryId: r.category_id,
  tier: r.tier === null ? null : pick<Tier | null>(Tier, r.tier, null),
  metric: r.metric as KpiBenchmark['metric'],
  ...percentiles(r),
  source: r.source,
  noteTh: r.note_th,
});

// ---------------------------------------------------------------------------------------------
// app.*
// ---------------------------------------------------------------------------------------------

export type UserRow = {
  id: string;
  display_name: Nullable<string>;
  picture_url: Nullable<string>;
  role: string;
  is_oa_friend: boolean;
  push_opt_in: boolean;
  needs_notice_ack: boolean;
};

export function meFromRow(r: UserRow): MeResponse {
  return {
    userId: r.id,
    // only LINE users have an app.users row
    isAnonymous: false,
    displayName: r.display_name,
    pictureUrl: r.picture_url,
    role: r.role === 'planner' || r.role === 'admin' ? r.role : 'member',
    isOaFriend: r.is_oa_friend,
    pushOptIn: r.push_opt_in,
    needsNoticeAck: r.needs_notice_ack,
  };
}

export type SavedRow = {
  id: string;
  result_id: string;
  title: string;
  note: Nullable<string>;
  tags: string[];
  is_pinned: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export function savedFromRow(r: SavedRow): SavedResult {
  return {
    id: r.id,
    resultId: r.result_id,
    title: r.title,
    note: r.note,
    tags: r.tags ?? [],
    isPinned: r.is_pinned,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

export function savedPatchColumns(patch: UpdateSavedPatch): Record<string, string | string[] | boolean | null> {
  const columns: Record<string, string | string[] | boolean | null> = {};
  if (patch.title !== undefined) columns['title'] = patch.title;
  if (patch.note !== undefined) columns['note'] = patch.note;
  if (patch.tags !== undefined) columns['tags'] = patch.tags;
  if (patch.isPinned !== undefined) columns['is_pinned'] = patch.isPinned;
  return columns;
}

export type HistoryRow = {
  run_id: string;
  status: string;
  channel: string;
  created_at: Timestamp;
  completed_at: Nullable<Timestamp>;
  result_id: Nullable<string>;
  brand_name: Nullable<string>;
  is_partial: Nullable<boolean>;
  expires_at: Nullable<Timestamp>;
  version: Nullable<number>;
  brand_logo_url: Nullable<string>;
  top3: unknown;
};

export function top3FromJson(v: unknown): HistoryItem['top3'] {
  if (!Array.isArray(v)) return null;
  return v.map((x) => {
    const o = asRecord(x) ?? {};
    const score = o['score'];
    const avatar = o['avatarUrl'];
    return {
      handle: String(o['handle'] ?? ''),
      avatarUrl: typeof avatar === 'string' ? avatar : null,
      score: typeof score === 'number' ? score : toNum(typeof score === 'string' ? score : null),
    };
  });
}

export function historyFromRow(r: HistoryRow): HistoryItem {
  return {
    runId: r.run_id,
    status: pick(RunStatus, r.status, 'failed'),
    channel: pick(Channel, r.channel, 'web'),
    createdAt: toIso(r.created_at),
    completedAt: toIsoOrNull(r.completed_at),
    resultId: r.result_id,
    brandName: r.brand_name,
    isPartial: r.is_partial,
    expiresAt: toIsoOrNull(r.expires_at),
    version: r.version,
    brandLogoUrl: r.brand_logo_url,
    top3: top3FromJson(r.top3),
  };
}

/** Opaque keyset cursor for history pages: base64url of [createdAt with microseconds, runId]. */
export function encodeCursor(createdAt: string, runId: string): string {
  return Buffer.from(JSON.stringify([createdAt, runId]), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | null): { createdAt: string; runId: string } | null {
  if (!cursor) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'string' && !Number.isNaN(Date.parse(v[0]))) {
      return { createdAt: v[0], runId: v[1] };
    }
  } catch {
    // fall through: an unreadable cursor restarts from the first page
  }
  return null;
}

/** LINE user IDs: 'U' + 32 hex chars (app.users.line_user_id check constraint). */
export const isLineUserId = (s: string): boolean => /^U[0-9a-f]{32}$/.test(s);

export const NOTICE_CONSENT = 'privacy_notice_ack';

/** Current privacy-notice version; when unset any granted acknowledgement counts. */
export function currentNoticeVersion(): string | null {
  const v = (process.env.NOTICE_VERSION ?? process.env.NEXT_PUBLIC_NOTICE_VERSION ?? '').trim();
  return v || null;
}
