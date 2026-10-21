# Package & App Contracts (MVP)

What each workspace exports and serves. Code is written against these signatures; change this file first when a
signature must change. Data shapes live in `@cvc/schemas` (zod + inferred types) — never redefine them locally.

Conventions for every package:

- ESM TypeScript source, consumed through Next `transpilePackages` (no build step). `exports: { ".": "./src/index.ts" }`.
- Relative imports without extensions (`./metrics`), `moduleResolution: Bundler`, `strict`, `noUncheckedIndexedAccess`.
- No new npm dependencies (everything needed is installed). No `any` in exported signatures.
- Read `process.env` lazily inside functions (not at module top level) so Next can build without secrets.
- **Demo mode:** each integration exposes `isXConfigured()`. When a key is missing and `DEMO_MODE !== 'off'`, the
  package returns its mock/stub implementation instead of throwing. Mocks produce **fictional** creators and brands only
  (no real people, no real handles, no avatars — the UI shows initials). Anything produced by a mock or stub is marked
  so the result ends up with `isDemo: true`.
- Thai user-facing strings end in `Th` fields; code comments in English.

---

## @cvc/schemas (done)

Zod schemas + types for every contract: `RunInput`, `InputBrief`, `AudiencePersona`, `BrandProfile`, `EvidenceCard`,
`CandidateRef`, `CreatorProfile`, `CreatorVideo`, `CreatorMetrics`, `AudienceEstimate`, `CreatorDossier`,
`KolEvaluation`, `SubScores`, `GroupWeights`, `RankedCreator`, `ExpectedKpis`, `Playbook`, `NextAction`,
`PortfolioPlan`, `CuratorOutput`, `PortfolioNarrative`, `Recommendation`, `FinalResult`, `ProgressEvent`, all API DTOs
(`api.ts`), ref rows (`TierBand`, `Category`, `RateCard`, `TierBenchmark`, `KpiBenchmark`, `RefData`) and the static
seeds `REF_SEED`, `PERSONAS_SEED`. Constants: `PIPELINE_VERSION`, `PROMPT_VERSION`, `RUBRIC_VERSION`,
`TERMINAL_STATUSES`, `STAGE_TO_STATUS`.

---

## @cvc/thai

```ts
export function thaiShare(text: string): number;                 // share of Thai script letters among letters, 0..1
export function isThaiText(text: string, min = 0.3): boolean;
export function segmentWords(text: string): string[];             // Intl.Segmenter('th', { granularity: 'word' }), word-like only
export function toFtsText(text: string): string;                  // segmented words joined by spaces (for to_tsvector('simple'))
export function toTsQuery(text: string): string;                  // 'คำ1 & คำ2'
export function formatNumber(n: number | null | undefined, digits = 0): string;   // '62,000' · null → '–'
export function formatCompact(n: number | null | undefined): string;               // 950 · 62K · 1.2M (Latin suffixes)
export function formatTHB(n: number | null | undefined): string;                   // '฿22,500'
export function formatTHBRange(r: { min: number; max: number } | null): string;  // '฿15,000–30,000'
export function formatPct(x: number | null | undefined, digits = 1): string;      // 0.071 → '7.1%'
export function formatDateTh(iso: string | Date, opts?: { withTime?: boolean }): string; // '21 ต.ค. 2569' (Buddhist era)
export function formatRelativeTh(iso: string | Date, now?: Date): string;        // '5 นาทีที่แล้ว'
export const THAI_WEEKDAYS: readonly string[];                   // Mon=0 … Sun=6: 'จันทร์' …
export function normalizeHandle(h: string): string;              // strip @, lowercase, trim
```

## @cvc/scoring (pure, deterministic, vitest)

Implements SYSTEM_DESIGN.md §6 and the consultant layer. No I/O, no randomness except a seeded PRNG.

```ts
export const PRESETS: Record<Objective, GroupWeights>;           // §6.5 table
export const INNER_WEIGHTS: { fit: {semantic,category,relevance,style}; audience: {demo,lang_region,interest};
  performance: {er,reach,consistency,growth,sponsored_perf}; trust: {authenticity,saturation,suitability}; cost: {cpv: 1} };

export function tierFor(followers: number | null, bands: TierBand[]): Tier | null;
export function computeMetrics(videos: CreatorVideo[], opts?: { now?: Date; maxVideos?: number; minAgeHours?: number;
  followerCount?: number | null; followers30dAgo?: number | null }): CreatorMetrics;   // §6.3, ER excludes saves

export function estimateFee(tier: Tier | null, categoryId: string | null, ref: RefData, format?: RateCard['format']): MinMax;
                                                                  // rate card × niche multiplier, cvc_internal first

export type GateContext = { now: Date; activeDays?: number /* 30 strict, 60 relaxed */; followerRange: MinMax | null; excludeHandles: string[]; blockedHandles: string[];
  competitors: string[]; exclusivityWindowDays: number; budgetPerCreatorTHB: number | null; minVideos90d: number;
  brandSafetyLevel: BrandSafetyLevel; categoryPolicy: Record<string, Category['tiktokBcPolicy']> };
export function gate0a(c: CandidateRef, ctx: GateContext): string[];   // failure codes, [] = pass
export function gate0b(d: CreatorDossier, estFee: MinMax, ctx: GateContext): string[];
export function gate0c(e: KolEvaluation, ctx: GateContext): string[];
export function preScore(c: CandidateRef): number;                       // cheap rank before enrich

export type EvaluatedCandidate = { dossier: CreatorDossier; evaluation: KolEvaluation | null; semantic: number | null;
  suspectedInjection: boolean; estFeeTHB: MinMax; gateFailures: string[] };
export type ScoringContext = { weights: GroupWeights; objective: Objective; brandCategories: string[];
  brandAudience: { ageDist: Record<string, number> | null; genderDist: Record<string, number> | null } | null;
  brandSafetyLevel: BrandSafetyLevel; ref: RefData; tierQuota?: { smallShareMin: number } ; seed?: number };
export function scoreCandidates(pool: EvaluatedCandidate[], ctx: ScoringContext): RankedCreator[];   // §6.8
export function rescore(ranked: RankedCreator[], weights: GroupWeights): RankedCreator[];            // re-weight groups, re-rank
export function demoScore(brand: {ageDist, genderDist} | null, audience: AudienceEstimate | null): number | null;
export function poolMedianScores(ranked: RankedCreator[]): GroupWeights;

// consultant layer
export function computeExpectedKpis(args: { metrics: CreatorMetrics; tier: Tier | null; fee: MinMax; objective: Objective;
  categoryId: string | null; ref: RefData }): ExpectedKpis;
  // views = organic p25/p50/p75 × sponsoredFactor (creator's own ratio if ≥3 sponsored posts, else kpi benchmark
  // 'sponsored_view_factor' p50); falls back to tier median_views benchmark when < 5 videos (method 'tier_benchmark').
  // engagements = views × erViews (creator ER, shrunk to tier benchmark). cpv p25 = fee.min / views.p75 … p75 = fee.max / views.p25.
  // conversion only for conversion | tiktok_shop: clicks = views × ctr(p25/p50/p75), orders = clicks × cvr.
  // confidence: high ≥ 15 videos and creator-based factor; medium ≥ 8; else low. notesTh explain every assumption.
export type PlaybookHints = Pick<Playbook, 'role' | 'recommendedFormats' | 'collaborationModel' | 'postingWindow'>;
export function playbookHints(args: { dossier: CreatorDossier; ranked: RankedCreator; objective: Objective }): PlaybookHints;
export function postingWindow(metrics: CreatorMetrics): Playbook['postingWindow'];   // null when < 6 dated videos
export function buildPortfolioPlan(args: { objective: Objective; budgetTHB: MinMax | null;
  items: { creatorId: string; handle: string; fee: MinMax; kpis: ExpectedKpis; role: CreatorRole }[] }): PortfolioPlan;
  // totals summed per percentile, budgetFit computed, Thai template text for mixTh/timeline/measurementPlanTh
export function baseNextActions(args: { objective: Objective; creators: { creatorId: string; handle: string }[] }): NextAction[];
export function creatorNextActions(args: { creatorId: string; handle: string; playbook: PlaybookHints; objective: Objective }): NextAction[];
```

Test (required): `src/score.test.ts` reproduces SYSTEM_DESIGN §4.7's worked example (fit .9175, audience .8375,
performance .7913 with growth null, trust .91, cost .72 → total 85; CPV = 22,500 / 62,000 = 0.36) and covers
computeMetrics, gates, expected KPIs (creator vs benchmark factor), budget fit.

## @cvc/db

postgres.js (`prepare: false`, `max: 1`, `idle_timeout: 20`) over the Supavisor pooler. Column names follow
`supabase/migrations/*` exactly; map snake_case ↔ camelCase in the repository layer. Two stores, each with a Postgres
implementation and an in-memory implementation (`globalThis`-cached so Next dev HMR keeps data) used when the URL env
var is empty.

```ts
export function isDbConfigured(service: 'api' | 'agent'): boolean;     // API_DATABASE_URL / AGENT_DATABASE_URL
export function getAgentStore(): AgentStore;                          // memoized
export function getApiStore(): ApiStore;
export async function inputHash(input: RunInput): Promise<string>;     // sha256 of the semantic fields (dedupe)

export type RunRecord = { id: string; ownerId: string; ownerType: OwnerType; channel: Channel; status: RunStatus;
  stage: Stage | null; progressPct: number; warnings: string[]; input: RunInput; inputHash: string;
  normalizedInput: InputBrief | null; brandProfileId: string | null; resultId: string | null; errorMessageTh: string | null;
  isDemo: boolean; workflowRunId: string | null; costUsd: number; createdAt: string; updatedAt: string; completedAt: string | null };

export interface AgentStore {
  kind: 'postgres' | 'memory';
  createRun(a: { ownerId: string; ownerType: OwnerType; channel: Channel; input: RunInput; inputHash: string;
    claimSecretHash: string | null; isDemo: boolean }): Promise<RunRecord>;
  findRecentRunByHash(ownerId: string, inputHash: string, withinHours: number): Promise<RunRecord | null>;
  getRun(runId: string): Promise<RunRecord | null>;
  listStaleRuns(olderThanMinutes: number, limit?: number): Promise<RunRecord[]>;   // non-terminal, not awaiting_review (cron requeue-stuck)
  updateRun(runId: string, patch: Partial<Pick<RunRecord, 'status' | 'stage' | 'progressPct' | 'warnings' |
    'normalizedInput' | 'brandProfileId' | 'resultId' | 'errorMessageTh' | 'workflowRunId' | 'costUsd' | 'completedAt'>>): Promise<void>;
  appendProgress(runId: string, e: ProgressEventInput): Promise<ProgressEvent>;   // assigns seq, at
  listProgress(runId: string, afterSeq: number): Promise<ProgressEvent[]>;
  getStep<T>(runId: string, stepKey: string): Promise<T | null>;                 // checkpoint (analysis.run_steps.output)
  putStep(runId: string, stepKey: string, output: unknown, meta?: { costUsd?: number; latencyMs?: number; model?: string }): Promise<void>;
  saveEvidence(runId: string, cards: EvidenceCard[]): Promise<void>;
  listEvidence(runId: string): Promise<EvidenceCard[]>;
  saveBrandProfile(runId: string, p: BrandProfile): Promise<string>;
  getBrandProfile(id: string): Promise<BrandProfile | null>;
  upsertCreator(p: CreatorProfile, a: { tier: Tier | null; avatarUrl: string | null; isDemo: boolean }): Promise<string>; // creatorId
  setCreatorAvatar(creatorId: string, avatarUrl: string | null, sourceUrl: string | null): Promise<void>;
  saveVideos(creatorId: string, videos: CreatorVideo[], coverUrls?: Record<string, string | null>): Promise<void>;
  saveCandidates(runId: string, rows: CandidateRow[]): Promise<void>;           // upsert by (runId, creatorId)
  listCandidates(runId: string): Promise<CandidateRow[]>;
  saveResult(r: FinalResult, ownerId: string): Promise<void>;                   // results + result_versions v1
  getResult(resultId: string): Promise<{ result: FinalResult; ownerId: string } | null>;
  saveResultVersion(resultId: string, r: FinalResult): Promise<number>;
  getChatSession(resultId: string, ownerId: string): Promise<ChatSessionRecord | null>;   // active one
  createChatSession(resultId: string, ownerId: string): Promise<ChatSessionRecord>;        // closes the previous one
  incrementResearchCalls(sessionId: string): Promise<number>;
  saveFeedback(resultId: string, ownerId: string, f: FeedbackRequest): Promise<void>;
  claimRuns(userId: string, items: { runId: string; claimSecretHash: string }[]): Promise<number>;   // hashes from the api, never re-hashed
  purgeUser(userId: string): Promise<{ runs: number; threadIds: string[] }>;   // deletes the user's runs (cascade) and returns chat thread ids to forget
  loadRefData(): Promise<RefData>;                                              // REF_SEED in memory mode
  listPersonas(ids?: string[]): Promise<AudiencePersona[]>;                    // PERSONAS_SEED in memory mode
}
export type CandidateRow = { creatorId: string; handle: string; status: 'discovered' | 'enriched' | 'evaluated' | 'excluded' | 'ranked';
  candidateRef: CandidateRef; dossier: CreatorDossier | null; evaluation: KolEvaluation | null; ranked: RankedCreator | null;
  gateFailures: string[]; suspectedInjection: boolean; estFeeTHB: MinMax | null; semantic: number | null };
export type ChatSessionRecord = { id: string; resultId: string; ownerId: string; sessionNo: number; threadId: string;
  researchCallsUsed: number; createdAt: string };

export interface ApiStore {
  kind: 'postgres' | 'memory';
  upsertLineUser(a: { userId: string; lineSub: string; displayName: string | null; pictureUrl: string | null }): Promise<void>;
  getUser(userId: string): Promise<MeResponse | null>;
  recordConsent(userId: string, c: { consentType: string; version: string; granted: boolean }): Promise<void>;
  listHistory(userId: string, cursor: string | null, limit: number): Promise<HistoryResponse>;
  listSaved(userId: string): Promise<SavedResult[]>;
  saveResult(userId: string, r: { resultId: string; title: string; note: string | null; tags: string[] }): Promise<SavedResult>;
  updateSaved(userId: string, id: string, patch: UpdateSavedRequest-shape): Promise<SavedResult | null>;
  deleteSaved(userId: string, id: string): Promise<boolean>;
  listPersonas(): Promise<AudiencePersona[]>;
  listCategories(): Promise<Category[]>;
  setOaFriend(lineSub: string, isFriend: boolean): Promise<void>;
}
```

## @cvc/cache

```ts
export function isRedisConfigured(): boolean;   // UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN
export function getRedis(): RedisLike;          // Upstash client or in-memory (get/set ex/incrbyfloat/del/expire)
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number; resetSec: number }>;
export async function cacheGetOrSet<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T>;
export async function withLock<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T | null>;  // null = lock held
export const budget: { add(runId: string, usd: number): Promise<number>; get(runId: string): Promise<number>;
  state(runId: string): Promise<'ok' | 'soft' | 'hard'> };              // BUDGET_SOFT_USD / BUDGET_HARD_USD
export const dedupe: { get(ownerId: string, inputHash: string): Promise<string | null>; set(ownerId: string, inputHash: string, runId: string, ttlSec: number): Promise<void>; del(ownerId: string, inputHash: string): Promise<void> };
```

## @cvc/auth

```ts
export type AuthUser = { id: string; isAnonymous: boolean; role: 'member' | 'planner' | 'admin'; lineSub: string | null; local: boolean };
export function isSupabaseConfigured(): boolean;
export async function verifySupabaseJwt(token: string): Promise<AuthUser>;   // JWKS ${SUPABASE_URL}/auth/v1/.well-known/jwks.json, aud 'authenticated'
export async function verifyVercelOidc(token: string, fromProject: string): Promise<{ sub: string }>;
export async function internalFetch(origin: string, path: string, init: RequestInit): Promise<Response>;  // adds OIDC bearer (getVercelOidcToken) or dev fallback
export function sha256Hex(s: string): Promise<string>;
export function randomSecret(bytes = 32): string;                            // base64url
export function timingSafeEqualStr(a: string, b: string): boolean;

// Hono middlewares (c.var.user / c.var.clientIp)
export function requireEdge(): MiddlewareHandler;      // x-cvc-edge === EDGE_SHARED_SECRET; when the secret is empty: allowed only if NODE_ENV !== 'production'
export function requireUser(opts?: { allowAnonymous?: boolean; requireLine?: boolean }): MiddlewareHandler;
  // Bearer Supabase JWT. When Supabase is NOT configured (local demo): user = { id: x-cvc-guest-id header (uuid), local: true, isAnonymous: true }
export function requireCron(): MiddlewareHandler;      // Authorization: Bearer CRON_SECRET
export function requireOidc(fromProject: 'api' | 'agent'): MiddlewareHandler;   // VERCEL_PROJECT_API / VERCEL_PROJECT_AGENT; dev fallback: x-cvc-edge
export type AuthVariables = { user: AuthUser; clientIp: string };
```

## @cvc/providers

```ts
export type SourceDoc = { sourceType: ClientSource; url: string; title: string; text: string; fetchedAt: string; meta: Record<string, unknown> };
export interface KolDataProvider {
  name: string; mock: boolean;
  searchCreators(q: { keyword: string; limit: number }): Promise<CandidateRef[]>;      // Thailand only
  getProfile(handle: string): Promise<CreatorProfile | null>;
  getVideos(handle: string, limit: number): Promise<CreatorVideo[]>;
}
export interface ClientIntelProvider {
  name: string; mock: boolean;
  crawlWebsite(url: string, maxPages: number): Promise<SourceDoc[]>;                  // Firecrawl
  facebookPage(url: string, maxPosts: number, timeoutSec: number): Promise<SourceDoc[]>; // Apify (page + posts)
  tiktokProfile(url: string): Promise<SourceDoc[]>;                                     // client's own TikTok via ScrapeCreators
}
export function isKolProviderConfigured(): boolean;   // SCRAPECREATORS_API_KEY
export function getKolProvider(): KolDataProvider;     // ScrapeCreators or mock
export function getClientIntelProvider(): ClientIntelProvider;   // live per source when its key exists, mock otherwise
export function createMockKolProvider(seed: string): KolDataProvider;   // ~40 fictional Thai creators, deterministic per seed,
  // realistic distributions per tier, 20 videos each with dates/views/likes/comments/shares, some sponsored, avatarSourceUrl null
export function normalizeScrapeCreatorsProfile(raw: unknown): CreatorProfile;
export function normalizeScrapeCreatorsVideo(raw: unknown): CreatorVideo;
export class ProviderError extends Error { retryable: boolean; status?: number }
```

## @cvc/media

```ts
export function isCreatorMediaConfigured(): boolean;  // CREATOR_MEDIA_BLOB_READ_WRITE_TOKEN
export function isPrivateBlobConfigured(): boolean;   // BLOB_PRIVATE_READ_WRITE_TOKEN
export async function cacheCreatorImage(a: { creatorId: string; sourceUrl: string | null; kind: 'avatar' | 'cover'; key?: string }): Promise<string | null>;
  // fetch (10 s timeout, image/* only, ≤ 5 MB) → put `creator-media/avatars/{creatorId}.{ext}` or
  // `creator-media/covers/{creatorId}/{key}.{ext}` (access public, addRandomSuffix false, allowOverwrite true,
  // cacheControlMaxAge 30 days) → public URL. Returns null when unconfigured, sourceUrl null, or the fetch fails.
export async function deleteCreatorMedia(creatorId: string): Promise<void>;
export async function readPrivateBlob(pathname: string): Promise<{ data: ArrayBuffer; contentType: string } | null>;  // uploads/…
export function initialsFor(handle: string): string;
```

## @cvc/ai

Models through `@ai-sdk/openai` (Responses API) or AI Gateway when `USE_AI_GATEWAY=true`. Structured outputs with
strict zod schemas. Every function has a deterministic stub used when `!isAiConfigured()`.

```ts
export function isAiConfigured(): boolean;            // OPENAI_API_KEY (or gateway)
export const models: { main(): LanguageModel; fast(): LanguageModel; embeddingId: string; transcribeId: string };
export type AiCtx = { runId?: string; onUsage?: (u: { model: string; inputTokens: number; outputTokens: number; costUsd: number }) => void | Promise<void>; signal?: AbortSignal };

export async function normalizeInput(input: RunInput, extras: { images: { url: string; mediaType: string; pathname: string }[]; personas: AudiencePersona[] }, ctx?: AiCtx): Promise<InputBrief>;  // LLM0
export async function summarizeSource(doc: SourceDoc, ctx?: AiCtx): Promise<EvidenceCard[]>;     // quarantined, no tools
export async function researchBrand(a: { brief: InputBrief; evidence: EvidenceCard[]; personas: AudiencePersona[]; categories: Category[]; allowWebSearch: boolean }, ctx?: AiCtx): Promise<BrandProfile>; // LLM1
export async function planQueries(brand: BrandProfile, ctx?: AiCtx): Promise<{ queries: { keyword: string; lang: 'th' | 'en'; rationale: string }[] }>; // LLM2a, ≤ 8
export async function screenInjection(d: CreatorDossier, ctx?: AiCtx): Promise<{ suspected: boolean; reason: string | null }>;
export async function evaluateCreator(brand: BrandProfile, d: CreatorDossier, ctx?: AiCtx): Promise<KolEvaluation>;  // LLM2b
export async function curateCreator(a: { brand: BrandProfile; dossier: CreatorDossier; ranked: RankedCreator; evaluation: KolEvaluation | null; hints: PlaybookHints; kpis: ExpectedKpis }, ctx?: AiCtx): Promise<CuratorOutput>; // LLM4
export async function curatePortfolio(a: { brand: BrandProfile; plan: PortfolioPlan; picks: { handle: string; role: CreatorRole; whyTh: string }[] }, ctx?: AiCtx): Promise<PortfolioNarrative>;
export async function transcribe(audio: ArrayBuffer, filename: string, contentType: string, ctx?: AiCtx): Promise<{ text: string; durationS: number | null }>;
export async function embed(texts: string[], ctx?: AiCtx): Promise<number[][]>;   // dims from OPENAI_EMBEDDING_DIMENSIONS
export function cosine(a: number[], b: number[]): number;
export function spotlight(id: string, type: string, text: string): string;       // <untrusted_source …> wrapper

// chat (§9): Mastra agent, memory per session thread, tools over the result
export type ChatToolsDeps = { getResult(): Promise<FinalResult>; getDossier(creatorId: string): Promise<CreatorDossier | null>;
  rescore(weights: GroupWeights): Promise<FinalResult>; researchCallsLeft(): Promise<number>; useResearchCall(): Promise<void> };
export function createChatAgent(deps: ChatToolsDeps): Agent;                          // tools: get_kol_dossier, compare_kols, simulate_weights, research_kol
export async function streamChat(a: { resultId: string; sessionId: string; threadId: string; ownerId: string; messages: UIMessage[]; deps: ChatToolsDeps }): Promise<Response>;
  // UI message stream response (AI SDK 7) — real agent when configured, otherwise a stub that answers from the result
  // numbers (compare / explain) and states that it is a demo reply.
export async function resetChatThread(threadId: string): Promise<void>;
```

Prompt files live in `src/prompts/*.ts` as pure functions with `PROMPT_VERSION`. No `temperature` for GPT-6 models.

---

## apps/agent (cvc-agent, port 3002)

Next.js 16 app whose only UI is a 200 status page. Hono app mounted at `app/api/agent/[[...route]]/route.ts`
(`new Hono().basePath('/api/agent')`, `handle()` from `hono/vercel`, export GET/POST/DELETE, `runtime = 'nodejs'`,
`maxDuration = 800`). `next.config.ts` is a plain Next config (`transpilePackages`, …) that loads the root `.env`. There is
no Vercel Workflow (no `withWorkflow`, no `workflow` package): runs are queued with Upstash Workflow on QStash
(`@upstash/workflow` 1.4.0, `@upstash/qstash` 2.12.1), so no request waits for the pipeline.

| Route | Auth | Notes |
|---|---|---|
| `GET /health` | – | `HealthResponse` + agent-only `runner: 'upstash' \| 'inline' \| 'unavailable'`; `configured.queue` = `QSTASH_TOKEN` and both signing keys set (booleans/mode only, never values) |
| `POST /transcribe` | edge + user | `TranscribeRequest` → `TranscribeResponse`; asset must be under `uploads/{userId}/`; rate limit |
| `POST /runs` | edge + user | `RunInput` → `202 CreateRunResponse` once the run is enqueued (never waits for the pipeline); dedupe; guests get `claimSecret`; runner `unavailable` → `503 { error: { code: 'queue_not_configured', messageTh } }`; `client.trigger` throws → `503 pipeline_unavailable`; both mark the run `failed` and release the dedupe key |
| `GET /runs/:id` | edge + owner | `RunStatusResponse` |
| `GET /runs/:id/events?after=` | edge + owner | `RunEventsResponse` (polling) |
| `GET /runs/:id/stream?startIndex=` | edge + owner | SSE of `ProgressEvent` polled from the store (`listProgress`), no workflow stream (stretch; closes at ~290 s) |
| `POST /runs/:id/cancel` | edge + owner | status `cancelled` (steps stop on their own once they see it), then `client.cancel(workflowRunId)` on the Upstash Workflow `Client` (404 / unknown run ignored) |
| `GET /results/:id` | edge + owner | `FinalResult` |
| `POST /results/:id/rescore` | edge + owner | `RescoreRequest` → `RescoreResponse` (no LLM) |
| `POST /results/:id/feedback` | edge + owner | `FeedbackRequest` → 204 |
| `POST /chat/:resultId` | edge + owner | AI SDK UI message stream |
| `GET /chat/:resultId/session` | edge + owner | `ChatSessionResponse` |
| `POST /chat/:resultId/reset` | edge + owner | new session → `ChatSessionResponse` |
| `POST /internal/claim-runs` | OIDC(api) | `ClaimRunsInternalRequest` (hashes) → `{ claimed }` |
| `POST /internal/purge-user` | OIDC(api) | `PurgeUserRequest` → `PurgeUserResponse` |
| `POST /webhooks/apify` | secret | signal only (verify via Apify API); phase 2 resumes the run with `client.notify` (`context.waitForEvent`) |
| `GET /cron/requeue-stuck`, `GET /cron/retention` | cron | §8.5; requeue-stuck cancels a stuck run with `client.cancel(workflowRunId)` |

**Workflow endpoint (outside Hono):** `POST /api/workflow/kol-match` → `app/api/workflow/kol-match/route.ts`
(`runtime = 'nodejs'`, `maxDuration = 800` per step call, also set in `vercel.json` → `functions["app/api/workflow/kol-match/route.ts"]`), handler = `serve<KolMatchPayload, PipelineOutcome>(…)` from
`@upstash/workflow/nextjs` in `src/pipeline/workflows/kol-match.ts`. Body = `{ runId }` only. Only QStash calls it:
`serve` verifies `Upstash-Signature` with `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` (the SDK skips
verification when either key is missing, so in production the handler answers `503 queue_not_configured` without both).
It lives outside `/api/agent`, so `requireEdge` does not apply and the web proxy never forwards to it (`/api/*` other than
`/api/agent/*` goes to api).

- **Trigger** (`src/pipeline/start.ts` / `queue.ts`): `new Client({ token: QSTASH_TOKEN, baseUrl?: QSTASH_URL })` from
  `@upstash/workflow` → `client.trigger({ url, body: { runId }, workflowRunId: 'kol-match-<runId>', retries: 3,
  flowControl: { key: 'cvc-kol-match', parallelism: PIPELINE_MAX_PARALLEL_RUNS (default 3) }, label: 'kol-match',
  headers? })`. The SDK prefixes the id, so `RunRecord.workflowRunId` = `wfr_kol-match-<runId>` (Upstash Console
  and DLQ show this id). `flowControl` / `retries` are trigger options and apply to the
  whole run (`serve` has no such options in 1.4.0).
- **Workflow URL:** `${base}/api/workflow/kol-match` with `base` = `UPSTASH_WORKFLOW_URL`, else on Vercel
  `https://$VERCEL_PROJECT_PRODUCTION_URL` (`VERCEL_ENV=production`) or `https://$VERCEL_URL` (preview), else (local, not
  production) `http://localhost:3002`. The same origin is handed to `serve` (as `UPSTASH_WORKFLOW_URL` in its `env`).
- **Preview bypass:** when `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel system env) is set, `x-vercel-protection-bypass` goes
  in the trigger `headers` **and** in `serve({ qstashClient: { headers } })`. The QStash client forwards its global
  headers (`Upstash-Forward-*`) on every step it publishes; trigger headers alone do not reach later steps because the
  SDK drops incoming `x-vercel-*` headers when it rebuilds `context.headers`.
- **Runner selection** (`runnerMode()`, `PIPELINE_RUNNER` default `auto`): `auto` → `upstash` when `QSTASH_TOKEN` is set,
  else `inline` when `NODE_ENV !== 'production'`, else `unavailable` · `upstash` → `upstash` if the token is set, else
  `unavailable` · `inline` → `inline` outside production, `unavailable` in production. `inline` =
  `runPipelineInline(runId)` after the response (`after()`), local/demo only. `unavailable` → `POST /runs` answers `503`
  `queue_not_configured` (`messageTh: 'ระบบคิวงานยังไม่ได้ตั้งค่า (QStash) จึงยังเริ่มการวิเคราะห์ไม่ได้'`) and marks the run
  `failed`. Production never runs the pipeline inline.
- **Errors:** the route function must not catch errors around `context.run` (the SDK ends each call with `WorkflowAbort`
  after a step). A thrown error retries that step (QStash retries with backoff); `WorkflowNonRetryableError` (from
  `@upstash/workflow`) fails the run at once. Then `failureFunction` calls `markRunFailed(runId, failResponse)` (no-op
  when the run is already terminal; sets `failed` + Thai message, releases the dedupe key) and the run lands in the
  Upstash DLQ. A step that finds the run cancelled/finished returns `{ inactive: true }` and the workflow calls
  `context.cancel()` (no failure function, no DLQ).

Pipeline: `runKolMatch(runId, step)` in `src/pipeline/plan.ts` is shared by both runners — Upstash passes
`(name, fn) => context.run(name, fn)`, inline passes an in-process retry loop. Step names are unique and must stay stable
across deploys (Upstash matches them against the steps already recorded for a run): `normalize`, `prefetch:<source>`,
`evidence`, `brand`, `plan-queries`, `discover`, `enrich:<n>`, `plan-evaluation`, `evaluate:<n>`, `rank`, `curate`,
`finalize`. Under Upstash the function re-runs from the top on every step call and only step results are replayed, so
code outside `step` is deterministic and side-effect free. Step I/O = IDs/counts only (results travel through QStash),
data via `AgentStore`, progress only via `store.appendProgress` (no workflow stream).
Steps (MVP §17.5): normalize → prefetch (website, facebook, tiktok in parallel, each optional) → summarize →
brand → plan queries → discover (search + gate 0a + pre-score) → enrich (top 25: profile + videos + metrics + avatar
cache + gate 0b) → evaluate (injection screen + LLM2b + gate 0c) → rank (`scoreCandidates`) → curate (top N: expected
KPIs, playbook hints, LLM4, portfolio plan, next actions) → assemble `FinalResult` → persist. Budget guard before every
paid call. `runPipelineInline(runId)` runs the same plan in-process (local/demo/tests; never in production).

## apps/api (cvc-api, port 3001)

Next.js 16 app, Hono at `app/api/[[...route]]/route.ts` (`basePath('/api')`). Owns `app` + `ref`.

| Route | Auth | Notes |
|---|---|---|
| `GET /health` | – | `HealthResponse` |
| `POST /auth/guest` | edge + BotID + rate limit | Supabase anonymous sign-in server-side → `SessionTokens` (demo: 501 `{ code: 'supabase_not_configured' }`) |
| `POST /auth/line/exchange` | edge | `{ idToken }` → verify with LINE (`client_id = LINE_LOGIN_CHANNEL_ID`) → find/create Supabase user → `SessionTokens` |
| `POST /auth/claim` | edge + LINE user | `ClaimRequest` → agent `/internal/claim-runs` via `internalFetch` → `ClaimResponse` |
| `POST /me/bootstrap`, `GET /me`, `POST /me/consents`, `DELETE /me` | edge + user | `MeResponse`; delete → agent purge (stub) |
| `POST /uploads/token` | edge + user | `@vercel/blob/client` `handleUpload`, pathname must start with `uploads/{userId}/`, images ≤ 10 MB, audio ≤ 25 MB |
| `GET /personas`, `GET /categories` | edge | `PersonasResponse` / `CategoriesResponse` (seed fallback) |
| `GET /history` | edge + LINE user | `HistoryResponse` |
| `GET/POST /saved-results`, `PATCH/DELETE /saved-results/:id` | edge + LINE user | saved results |
| `POST /webhooks/line` | `x-line-signature` | follow / unfollow → `setOaFriend` |
| `POST /internal/notify` | OIDC(agent) | LINE push text (no emoji) |
| `GET /cron/purge` | cron | retention of `app` |

## apps/web (cvc-web, port 3000)

Next.js 16 App Router, Tailwind v4, Mitr, `docs/UI_CONTRACT.md`. `proxy.ts` forwards `/api/agent/*` → AGENT and
`/api/*` → API with `x-cvc-edge`, `x-cvc-client-ip`, preview bypass; 404 for `internal|cron` paths.

Shared modules (part 1 writes them, part 2 imports them):

```ts
// lib/api.ts — same-origin fetch through proxy.ts
export class ApiError extends Error { status: number; code: string; messageTh: string }
export async function apiFetch<T>(path: string, init?: RequestInit & { json?: unknown; schema?: ZodType<T> }): Promise<T>;
  // adds Authorization (Supabase access token) or x-cvc-guest-id (local demo), JSON body, parses ApiError
export function authHeaders(): Promise<Record<string, string>>;
export const agentApi: { createRun(i: RunInputDraft): Promise<CreateRunResponse>; getRun(id): Promise<RunStatusResponse>;
  events(id, after: number): Promise<RunEventsResponse>; cancel(id): Promise<void>; getResult(id): Promise<FinalResult>;
  rescore(id, body: RescoreRequest): Promise<RescoreResponse>; feedback(id, body: FeedbackRequest): Promise<void>;
  chatSession(resultId): Promise<ChatSessionResponse>; resetChat(resultId): Promise<ChatSessionResponse>;
  transcribe(assetPathname: string): Promise<TranscribeResponse> };
export const systemApi: { personas(): Promise<PersonasResponse>; me(): Promise<MeResponse>; history(cursor?): Promise<HistoryResponse>;
  listSaved(): Promise<SavedResult[]>; saveResult(b): Promise<SavedResult>; deleteSaved(id): Promise<void>; claim(items): Promise<ClaimResponse> };

// lib/session.tsx — client context
export function SessionProvider(props: { children: ReactNode }): JSX.Element;
export function useSession(): { status: 'loading' | 'guest' | 'line'; user: MeResponse | null; isLiff: boolean;
  loginWithLine(): Promise<void>; logout(): Promise<void> };

// lib/local-store.ts — IndexedDB (idb-keyval) for guests
export type LocalRun = { runId: string; companyName: string; createdAt: string; claimSecret: string | null; resultId: string | null; status: RunStatus };
export const localStore: { listRuns(): Promise<LocalRun[]>; putRun(r: LocalRun): Promise<void>;
  saveResult(r: FinalResult, title: string): Promise<void>; listSavedResults(): Promise<{ resultId: string; title: string; savedAt: string; brandName: string }[]>;
  getSavedResult(resultId: string): Promise<FinalResult | null>; removeSavedResult(resultId: string): Promise<void> };

// components/ui/* — primitives (props are the contract)
Button({ variant?: 'primary' | 'secondary' | 'tertiary' | 'danger', size?: 'sm' | 'md', loading?, ...button props })
ButtonLink({ href, variant?, size?, children })        Badge({ tone?: 'neutral' | 'accent' | 'positive' | 'warning' | 'negative', children })
Card({ className?, children })   SectionHeading({ title, action? })   PageHeader({ title, description?, actions? })
CreatorAvatar({ src: string | null, handle: string, size?: 32 | 40 | 64 })   Skeleton({ className })
EmptyState({ title, action? })   ErrorBlock({ messageTh, onRetry? })   DemoBanner()
Tabs({ items: { id: string; label: string }[], value: string, onChange(id) })   Sheet({ open, onClose, title?, children, width? })
Tooltip({ content, children })   Field({ label, hint?, error?, children })   Input / Textarea / Select (forwardRef, native props)
```
