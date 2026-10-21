import type { ClientSource, CreatorDossier, FinalResult, GroupWeights, Playbook } from '@cvc/schemas';

export type AiUsage = { model: string; inputTokens: number; outputTokens: number; costUsd: number };

export type AiCtx = {
  runId?: string;
  onUsage?: (u: AiUsage) => void | Promise<void>;
  signal?: AbortSignal;
};

/**
 * Structural copy of `SourceDoc` from @cvc/providers (CONTRACTS.md). Declared here so @cvc/ai does not depend on the
 * providers package; the two types are identical, so values flow between them without casts.
 */
export type SourceDoc = {
  sourceType: ClientSource;
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
  meta: Record<string, unknown>;
};

/** Same shape as `PlaybookHints` exported by @cvc/scoring. */
export type PlaybookHints = Pick<Playbook, 'role' | 'recommendedFormats' | 'collaborationModel' | 'postingWindow'>;

export type ChatToolsDeps = {
  getResult(): Promise<FinalResult>;
  getDossier(creatorId: string): Promise<CreatorDossier | null>;
  rescore(weights: GroupWeights): Promise<FinalResult>;
  researchCallsLeft(): Promise<number>;
  useResearchCall(): Promise<void>;
};
