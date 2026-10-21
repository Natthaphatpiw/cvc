import type { PlaybookHints } from '@cvc/scoring';
import type {
  CandidateRef,
  ClientSource,
  CuratorOutput,
  EvidenceCard,
  ExpectedKpis,
  NarrativeStatus,
  NextAction,
  PortfolioNarrative,
  PortfolioPlan,
} from '@cvc/schemas';

/** Client sources prefetched in the MVP (§17.5). */
export type SourceKind = 'website' | 'facebook' | 'tiktok';
export const SOURCE_KINDS: readonly SourceKind[] = ['website', 'facebook', 'tiktok'];

export const ENRICH_LIMIT = 25;
export const DISCOVER_KEEP = 40;
export const BATCH_SIZE = 5;
export const MAX_QUERIES = 8;
export const MIN_PASSING_BEFORE_RELAX = 10;
export const ALTERNATIVES_COUNT = 5;
/** Alternatives need brand fit ≥ this share of the weakest recommended creator's fit group score. */
export const ALTERNATIVE_FIT_FLOOR = 0.6;

/** Checkpoint keys in analysis.run_steps (step_key). */
export const StepKey = {
  normalize: 'normalize',
  prefetch: (s: SourceKind) => `prefetch.${s}`,
  evidence: 'evidence',
  brand: 'llm1.brand',
  plan: 'llm2a.plan',
  discover: 'discover',
  enrich: (b: number) => `enrich.batch.${b}`,
  evaluatePlan: 'evaluate.plan',
  evaluate: (b: number) => `llm2b.batch.${b}`,
  rank: 'rank',
  curate: 'llm4.curate',
  finalize: 'finalize',
} as const;

export type SourceRef = { url: string; title: string; sourceType: ClientSource; fetchedAt: string };

export type NormalizeCheckpoint = { sources: SourceKind[] };
export type PrefetchCheckpoint = { cards: EvidenceCard[]; docs: SourceRef[]; warning: string | null };
export type EvidenceCheckpoint = { cards: number; docs: SourceRef[] };
export type BrandCheckpoint = { brandProfileId: string };
export type PlannedQuery = { keyword: string; lang: 'th' | 'en'; rationale: string };
export type PlanCheckpoint = { queries: PlannedQuery[]; fallback: boolean };
export type DiscoverCheckpoint = {
  refs: CandidateRef[];
  scanned: number;
  passed: number;
  relaxed: boolean;
  providerName: string;
  providerMock: boolean;
  searchFailures: number;
};
export type EnrichCheckpoint = {
  enriched: number;
  excluded: number;
  failed: number;
  /** creatorId → platformVideoId → cached public cover URL */
  covers: Record<string, Record<string, string | null>>;
};
export type EvaluatePlanCheckpoint = { creatorIds: string[] };
export type EvaluateCheckpoint = { evaluated: number; excluded: number; failed: number; skipped: number };
export type RankCheckpoint = { ranked: number; semanticOk: boolean };

export type CuratedItem = {
  creatorId: string;
  status: NarrativeStatus;
  curator: CuratorOutput | null;
  kpis: ExpectedKpis;
  hints: PlaybookHints;
  nextActions: NextAction[];
};
export type CurateCheckpoint = {
  items: CuratedItem[];
  plan: PortfolioPlan;
  narrative: PortfolioNarrative | null;
  baseActions: NextAction[];
  failures: number;
  budgetStopped: boolean;
};
export type FinalizeCheckpoint = { resultId: string | null; status: 'completed' | 'partial' | 'failed' };
