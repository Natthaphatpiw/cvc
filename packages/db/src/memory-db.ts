import type {
  BrandProfile,
  CreatorProfile,
  CreatorVideo,
  EvidenceCard,
  FeedbackRequest,
  FinalResult,
  ProgressEvent,
  SavedResult,
  Tier,
} from '@cvc/schemas';
import type { CandidateRow, ChatSessionRecord, ResultVersionReason, RunRecord } from './types';
import { globalSingleton } from './util';

/**
 * In-memory stand-in for the Postgres schema, shared by the memory AgentStore and ApiStore of one process.
 * Lives on globalThis so Next dev HMR keeps the data. Each Next app is its own process, so in local demo mode
 * the api cannot see runs created by the agent (history stays empty there).
 */
export type MemRun = Omit<RunRecord, 'brandProfileId' | 'resultId'> & {
  claimSecretHash: string | null;
  expiresAt: string | null;
  startedAt: string | null;
};

export type MemCreator = {
  id: string;
  platformUserId: string;
  handle: string;
  profile: CreatorProfile;
  tier: Tier | null;
  avatarUrl: string | null;
  avatarSourceUrl: string | null;
  isDemo: boolean;
  updatedAt: string;
};

export type MemVideo = CreatorVideo & { creatorId: string; coverUrl: string | null };

export type MemStep = { output: unknown; costUsd: number | null; latencyMs: number | null; model: string | null; finishedAt: string };

export type MemResult = {
  id: string;
  runId: string;
  ownerId: string;
  version: number;
  result: FinalResult;
  createdAt: string;
  expiresAt: string | null;
};

export type MemResultVersion = { resultId: string; version: number; reason: ResultVersionReason; result: FinalResult; createdAt: string };

export type MemChatSession = ChatSessionRecord & { status: 'active' | 'reset' | 'expired'; endedAt: string | null };

export type MemFeedback = {
  id: string;
  resultId: string;
  creatorId: string | null;
  userId: string;
  kind: FeedbackRequest['kind'];
  reason: string | null;
  createdAt: string;
};

export type MemUser = {
  id: string;
  lineUserId: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  role: 'member' | 'planner' | 'admin';
  isOaFriend: boolean;
  pushOptIn: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type MemConsent = {
  userId: string;
  consentType: string;
  version: string;
  granted: boolean;
  grantedAt: string;
  revokedAt: string | null;
};

export type MemSaved = SavedResult & { userId: string };

export type MemoryDb = {
  runs: Map<string, MemRun>;
  progress: Map<string, ProgressEvent[]>;
  /** key: `${runId}\n${stepKey}` */
  steps: Map<string, MemStep>;
  evidence: Map<string, EvidenceCard[]>;
  brandProfiles: Map<string, { id: string; runId: string; profile: BrandProfile }>;
  creators: Map<string, MemCreator>;
  /** key: platformVideoId */
  videos: Map<string, MemVideo>;
  /** runId → creatorId → row */
  candidates: Map<string, Map<string, CandidateRow>>;
  results: Map<string, MemResult>;
  resultVersions: MemResultVersion[];
  chatSessions: Map<string, MemChatSession>;
  feedback: MemFeedback[];
  users: Map<string, MemUser>;
  consents: MemConsent[];
  saved: Map<string, MemSaved>;
};

export function createMemoryDb(): MemoryDb {
  return {
    runs: new Map(),
    progress: new Map(),
    steps: new Map(),
    evidence: new Map(),
    brandProfiles: new Map(),
    creators: new Map(),
    videos: new Map(),
    candidates: new Map(),
    results: new Map(),
    resultVersions: [],
    chatSessions: new Map(),
    feedback: [],
    users: new Map(),
    consents: [],
    saved: new Map(),
  };
}

/** Bump the key suffix when MemoryDb changes shape, so an HMR reload does not reuse an outdated object. */
export function getMemoryDb(): MemoryDb {
  return globalSingleton('cvc.db.memory.v1', createMemoryDb);
}

/** Clears the shared memory database (tests). */
export function resetMemoryDb(): void {
  Object.assign(getMemoryDb(), createMemoryDb());
}
