import type {
  AudiencePersona,
  BrandProfile,
  CandidateRef,
  Category,
  Channel,
  CreatorDossier,
  CreatorProfile,
  CreatorVideo,
  EvidenceCard,
  FeedbackRequest,
  FinalResult,
  HistoryResponse,
  InputBrief,
  KolEvaluation,
  MeResponse,
  MinMax,
  OwnerType,
  ProgressEvent,
  ProgressEventInput,
  RankedCreator,
  RefData,
  RunInput,
  RunStatus,
  SavedResult,
  Stage,
  Tier,
  UpdateSavedRequest,
} from '@cvc/schemas';

export type RunRecord = {
  id: string;
  ownerId: string;
  ownerType: OwnerType;
  channel: Channel;
  status: RunStatus;
  stage: Stage | null;
  progressPct: number;
  warnings: string[];
  input: RunInput;
  inputHash: string;
  normalizedInput: InputBrief | null;
  /** Derived from analysis.brand_profiles (one per run); set by saveBrandProfile. */
  brandProfileId: string | null;
  /** Derived from analysis.results (one per run); set by saveResult. */
  resultId: string | null;
  errorMessageTh: string | null;
  isDemo: boolean;
  workflowRunId: string | null;
  costUsd: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type RunPatch = Partial<
  Pick<
    RunRecord,
    | 'status'
    | 'stage'
    | 'progressPct'
    | 'warnings'
    | 'normalizedInput'
    | 'brandProfileId'
    | 'resultId'
    | 'errorMessageTh'
    | 'workflowRunId'
    | 'costUsd'
    | 'completedAt'
  >
>;

export type CandidateStatus = 'discovered' | 'enriched' | 'evaluated' | 'excluded' | 'ranked';

export type CandidateRow = {
  creatorId: string;
  handle: string;
  status: CandidateStatus;
  candidateRef: CandidateRef;
  dossier: CreatorDossier | null;
  evaluation: KolEvaluation | null;
  ranked: RankedCreator | null;
  gateFailures: string[];
  suspectedInjection: boolean;
  estFeeTHB: MinMax | null;
  semantic: number | null;
};

export type ChatSessionRecord = {
  id: string;
  resultId: string;
  ownerId: string;
  sessionNo: number;
  threadId: string;
  researchCallsUsed: number;
  createdAt: string;
};

/** analysis.result_versions.reason */
export type ResultVersionReason = 'initial' | 'rescore' | 'relax' | 'curate' | 'chat_add' | 'redaction';

export type StepMeta = { costUsd?: number; latencyMs?: number; model?: string };

export interface AgentStore {
  kind: 'postgres' | 'memory';
  createRun(a: {
    ownerId: string;
    ownerType: OwnerType;
    channel: Channel;
    input: RunInput;
    inputHash: string;
    claimSecretHash: string | null;
    isDemo: boolean;
  }): Promise<RunRecord>;
  /** Latest non-failed, non-cancelled run of this owner with the same input hash. */
  findRecentRunByHash(ownerId: string, inputHash: string, withinHours: number): Promise<RunRecord | null>;
  getRun(runId: string): Promise<RunRecord | null>;
  /**
   * In-flight runs (status not terminal and not 'awaiting_review') whose updated_at is older than
   * now − olderThanMinutes, oldest first. limit defaults to 50.
   */
  listStaleRuns(olderThanMinutes: number, limit?: number): Promise<RunRecord[]>;
  /**
   * brandProfileId / resultId are derived from their own tables and ignored here. A non-terminal status never
   * replaces a terminal one: the patch is not applied and StoreError('conflict') is thrown (e.g. a progress write
   * racing a cancel).
   */
  updateRun(runId: string, patch: RunPatch): Promise<void>;
  /** Assigns seq (1-based, gapless per run) and at. */
  appendProgress(runId: string, e: ProgressEventInput): Promise<ProgressEvent>;
  /** Events with seq > afterSeq, ascending. */
  listProgress(runId: string, afterSeq: number): Promise<ProgressEvent[]>;
  getStep<T>(runId: string, stepKey: string): Promise<T | null>;
  putStep(runId: string, stepKey: string, output: unknown, meta?: StepMeta): Promise<void>;
  /** Appends cards (identical cards are stored once); refs E1..En follow insertion order. */
  saveEvidence(runId: string, cards: EvidenceCard[]): Promise<void>;
  listEvidence(runId: string): Promise<EvidenceCard[]>;
  saveBrandProfile(runId: string, p: BrandProfile): Promise<string>;
  getBrandProfile(id: string): Promise<BrandProfile | null>;
  upsertCreator(p: CreatorProfile, a: { tier: Tier | null; avatarUrl: string | null; isDemo: boolean }): Promise<string>;
  setCreatorAvatar(creatorId: string, avatarUrl: string | null, sourceUrl: string | null): Promise<void>;
  saveVideos(creatorId: string, videos: CreatorVideo[], coverUrls?: Record<string, string | null>): Promise<void>;
  saveCandidates(runId: string, rows: CandidateRow[]): Promise<void>;
  listCandidates(runId: string): Promise<CandidateRow[]>;
  saveResult(r: FinalResult, ownerId: string): Promise<void>;
  getResult(resultId: string): Promise<{ result: FinalResult; ownerId: string } | null>;
  /** Stores r as the next version (r.version is overwritten) and returns that version number. */
  saveResultVersion(resultId: string, r: FinalResult, reason?: ResultVersionReason): Promise<number>;
  getChatSession(resultId: string, ownerId: string): Promise<ChatSessionRecord | null>;
  createChatSession(resultId: string, ownerId: string): Promise<ChatSessionRecord>;
  incrementResearchCalls(sessionId: string): Promise<number>;
  saveFeedback(resultId: string, ownerId: string, f: FeedbackRequest): Promise<void>;
  claimRuns(userId: string, items: { runId: string; claimSecretHash: string }[]): Promise<number>;
  /**
   * PDPA delete: removes the user's runs (results, versions, candidates, evidence, chat sessions, feedback and
   * saved / shared bookmarks go with them by cascade) and returns the Mastra thread ids of the user's chat sessions,
   * which live outside these tables and must be forgotten by the caller.
   */
  purgeUser(userId: string): Promise<{ runs: number; threadIds: string[] }>;
  loadRefData(): Promise<RefData>;
  listPersonas(ids?: string[]): Promise<AudiencePersona[]>;
}

export type UpdateSavedPatch = ReturnType<(typeof UpdateSavedRequest)['parse']>;

export interface ApiStore {
  kind: 'postgres' | 'memory';
  upsertLineUser(a: { userId: string; lineSub: string; displayName: string | null; pictureUrl: string | null }): Promise<void>;
  /** null when the user has no app.users row (guests). */
  getUser(userId: string): Promise<MeResponse | null>;
  /** No-op for users without an app.users row (guests acknowledge the notice per run). */
  recordConsent(userId: string, c: { consentType: string; version: string; granted: boolean }): Promise<void>;
  listHistory(userId: string, cursor: string | null, limit: number): Promise<HistoryResponse>;
  listSaved(userId: string): Promise<SavedResult[]>;
  /** Throws StoreError('not_found') when the result does not exist or is not owned by userId. */
  saveResult(userId: string, r: { resultId: string; title: string; note: string | null; tags: string[] }): Promise<SavedResult>;
  updateSaved(userId: string, id: string, patch: UpdateSavedPatch): Promise<SavedResult | null>;
  deleteSaved(userId: string, id: string): Promise<boolean>;
  listPersonas(): Promise<AudiencePersona[]>;
  listCategories(): Promise<Category[]>;
  setOaFriend(lineSub: string, isFriend: boolean): Promise<void>;
}

export type StoreErrorCode = 'not_found' | 'conflict' | 'invalid';

export class StoreError extends Error {
  readonly code: StoreErrorCode;
  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}
