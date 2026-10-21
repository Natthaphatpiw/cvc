import { planQueries } from '@cvc/ai';
import { getKolProvider } from '@cvc/providers';
import { gate0a, preScore } from '@cvc/scoring';
import type { BrandProfile, CandidateRef } from '@cvc/schemas';
import { normalizeHandle } from '@cvc/thai';
import { errorMessage, mapLimit } from '../../lib/async';
import {
  addWarnings,
  briefOf,
  buildGateContext,
  createAiCtx,
  demoPause,
  emitProgress,
  getCheckpoint,
  guardBudget,
  loadActiveRun,
  loadBrandOrFail,
  loadRef,
  putCheckpoint,
} from '../context';
import {
  BATCH_SIZE,
  DISCOVER_KEEP,
  ENRICH_LIMIT,
  MAX_QUERIES,
  MIN_PASSING_BEFORE_RELAX,
  StepKey,
  type DiscoverCheckpoint,
  type PlanCheckpoint,
  type PlannedQuery,
} from '../types';

const SEARCH_LIMIT_PER_QUERY = 30;
const SEARCH_CONCURRENCY = 4;

function dedupeQueries(queries: PlannedQuery[]): PlannedQuery[] {
  const seen = new Set<string>();
  const out: PlannedQuery[] = [];
  for (const q of queries) {
    const keyword = q.keyword.trim();
    const k = keyword.toLowerCase();
    if (!keyword || seen.has(k)) continue;
    seen.add(k);
    out.push({ ...q, keyword });
    if (out.length >= MAX_QUERIES) break;
  }
  return out;
}

/** Code fallback for LLM2a: the brand profile already carries Thai/English keywords and hashtags. */
function fallbackQueries(brand: BrandProfile): PlannedQuery[] {
  const mq = brand.matchingQueries;
  return dedupeQueries([
    ...mq.keywordsTh.map((keyword) => ({ keyword, lang: 'th' as const, rationale: 'brand keyword' })),
    ...mq.seedHashtags.map((h) => ({ keyword: h.replace(/^#/, ''), lang: 'th' as const, rationale: 'seed hashtag' })),
    ...mq.keywordsEn.map((keyword) => ({ keyword, lang: 'en' as const, rationale: 'brand keyword' })),
    { keyword: brand.brand.name, lang: 'th' as const, rationale: 'brand name' },
  ]);
}

/** LLM2a: ≤ 8 search queries (Thai + English) derived from the brand profile. */
export async function planQueriesStep(runId: string): Promise<{ queryCount: number }> {
  'use step';
  const done = await getCheckpoint<PlanCheckpoint>(runId, StepKey.plan);
  if (done) return { queryCount: done.queries.length };

  const run = await loadActiveRun(runId);
  const brand = await loadBrandOrFail(run);
  const started = Date.now();
  await emitProgress(runId, { stage: 'discover', status: 'started', pct: 38, messageTh: 'กำลังวางแผนคำค้นหาครีเอเตอร์ภาษาไทยและอังกฤษ' });
  await demoPause(run);

  const ledger = createAiCtx(runId);
  let queries: PlannedQuery[] = [];
  let fallback = false;
  if ((await guardBudget(runId)) !== 'hard') {
    try {
      queries = dedupeQueries((await planQueries(brand, ledger.ctx)).queries);
    } catch (err) {
      console.warn('[agent] planQueries failed, using brand keywords', errorMessage(err));
    }
  }
  if (queries.length === 0) {
    queries = fallbackQueries(brand);
    fallback = true;
  }

  const out: PlanCheckpoint = { queries, fallback };
  await putCheckpoint(runId, StepKey.plan, out, { costUsd: ledger.spentUsd(), latencyMs: Date.now() - started, model: ledger.model() });
  await emitProgress(runId, { stage: 'discover', status: 'progress', pct: 40, messageTh: `ค้นหาครีเอเตอร์ด้วยคำค้น ${queries.length} ชุด` });
  return { queryCount: queries.length };
}

function refKey(r: CandidateRef): string {
  return r.platformUserId ? `id:${r.platformUserId}` : `h:${normalizeHandle(r.handle)}`;
}

/** Search → gate 0a → dedupe → pre-score → keep the top 40 (relaxing gate 0a once when fewer than 10 pass). */
export async function discoverStep(runId: string): Promise<{ batchCount: number; candidates: number }> {
  'use step';
  const done = await getCheckpoint<DiscoverCheckpoint>(runId, StepKey.discover);
  if (done) return { batchCount: Math.ceil(Math.min(ENRICH_LIMIT, done.refs.length) / BATCH_SIZE), candidates: done.refs.length };

  const run = await loadActiveRun(runId);
  const started = Date.now();
  const [brand, ref, plan] = await Promise.all([loadBrandOrFail(run), loadRef(), getCheckpoint<PlanCheckpoint>(runId, StepKey.plan)]);
  const queries = plan?.queries ?? fallbackQueries(brand);
  await demoPause(run);

  const provider = getKolProvider();
  let searchFailures = 0;
  const hits = await mapLimit(queries, SEARCH_CONCURRENCY, async (q) => {
    try {
      return await provider.searchCreators({ keyword: q.keyword, limit: SEARCH_LIMIT_PER_QUERY });
    } catch (err) {
      searchFailures += 1;
      console.warn('[agent] searchCreators failed', q.keyword, errorMessage(err));
      return [];
    }
  });
  if (queries.length > 0 && searchFailures === queries.length) {
    // Retryable: the provider may be briefly unavailable.
    throw new Error('ค้นหาครีเอเตอร์จากแหล่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }

  const unique = new Map<string, CandidateRef>();
  for (const r of hits.flat()) if (!unique.has(refKey(r))) unique.set(refKey(r), r);
  const all = [...unique.values()];

  const brief = briefOf(run);
  const strict = buildGateContext({ run, brief, brand, ref });
  let passing = all.filter((r) => gate0a(r, strict).length === 0);
  let relaxed = false;
  if (passing.length < MIN_PASSING_BEFORE_RELAX) {
    const loose = buildGateContext({ run, brief, brand, ref, relaxed: true });
    passing = all.filter((r) => gate0a(r, loose).length === 0);
    relaxed = true;
  }

  const refs = passing
    .map((r) => ({ r, s: preScore(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, DISCOVER_KEEP)
    .map(({ r }) => r);

  const out: DiscoverCheckpoint = {
    refs,
    scanned: all.length,
    passed: passing.length,
    relaxed,
    providerName: provider.name,
    providerMock: provider.mock,
    searchFailures,
  };
  await putCheckpoint(runId, StepKey.discover, out, { latencyMs: Date.now() - started });
  if (searchFailures > 0) await addWarnings(runId, [`ค้นหาด้วยคำค้นบางชุดไม่สำเร็จ (${searchFailures} จาก ${queries.length} ชุด)`]);
  await emitProgress(runId, {
    stage: 'discover',
    status: 'progress',
    pct: 48,
    messageTh: `พบครีเอเตอร์ที่ผ่านเกณฑ์เบื้องต้น ${passing.length} คน จากที่ค้นพบทั้งหมด ${all.length} คน`,
    partial: { candidatesFound: passing.length },
  });
  return { batchCount: Math.ceil(Math.min(ENRICH_LIMIT, refs.length) / BATCH_SIZE), candidates: refs.length };
}
