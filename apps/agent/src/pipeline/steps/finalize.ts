import { isAiConfigured } from '@cvc/ai';
import { dedupe } from '@cvc/cache';
import type { RunRecord } from '@cvc/db';
import { PRESETS, poolMedianScores } from '@cvc/scoring';
import { FinalResult } from '@cvc/schemas';
import { WorkflowNonRetryableError } from '@upstash/workflow';
import { errorMessage } from '../../lib/async';
import {
  buildAlternative,
  buildFinalResult,
  buildRecommendation,
  categoryFor,
  codeOnlyCuration,
  sortByRank,
} from '../assemble';
import { loadEnrichSummary } from '../candidates';
import {
  MSG,
  RUN_INACTIVE,
  audienceSourceOf,
  briefOf,
  budgetState,
  campaignOf,
  emitProgress,
  getCheckpoint,
  getRunOrFail,
  isTerminal,
  loadBrandOrFail,
  loadRef,
  putCheckpoint,
  store,
  toThaiError,
} from '../context';
import {
  ALTERNATIVE_FIT_FLOOR,
  ALTERNATIVES_COUNT,
  BATCH_SIZE,
  StepKey,
  type CurateCheckpoint,
  type DiscoverCheckpoint,
  type EvaluateCheckpoint,
  type EvaluatePlanCheckpoint,
  type EvidenceCheckpoint,
  type FinalizeCheckpoint,
  type RankCheckpoint,
} from '../types';

async function releaseDedupe(ownerId: string, inputHash: string): Promise<void> {
  try {
    await dedupe.del(ownerId, inputHash);
  } catch (err) {
    console.warn('[agent] dedupe.del failed', errorMessage(err));
  }
}

const SOURCE_LABEL: Record<string, string> = {
  website: 'website',
  facebook_page: 'facebook',
  facebook_posts: 'facebook',
  facebook_ads: 'facebook_ads',
  tiktok: 'tiktok',
};

/** Marks the run done once its result is saved: 'done' event, run row, dedupe, checkpoint. */
async function completeRun(run: RunRecord, resultId: string, isPartial: boolean, emitDone: boolean): Promise<FinalizeCheckpoint> {
  const status = isPartial ? 'partial' : 'completed';
  if (emitDone) {
    await emitProgress(run.id, {
      stage: 'done',
      status: 'completed',
      pct: 100,
      messageTh: isPartial ? 'วิเคราะห์เสร็จแล้ว (บางส่วนไม่สมบูรณ์)' : 'วิเคราะห์เสร็จแล้ว',
      partial: { resultId },
    });
  }
  await store().updateRun(run.id, { status, stage: 'done', progressPct: 100, resultId, completedAt: new Date().toISOString() });
  if (isPartial) await releaseDedupe(run.ownerId, run.inputHash);

  const out: FinalizeCheckpoint = { resultId, status };
  await putCheckpoint(run.id, StepKey.finalize, out);
  return out;
}

/** Assemble FinalResult v1 → results + result_versions v1 → run completed | partial. */
export async function finalizeStep(runId: string): Promise<FinalizeCheckpoint> {
  const done = await getCheckpoint<FinalizeCheckpoint>(runId, StepKey.finalize);
  if (done) return done;

  const run = await getRunOrFail(runId);
  if (run.resultId) {
    if (run.status === 'completed' || run.status === 'partial') return { resultId: run.resultId, status: run.status };
    if (isTerminal(run)) throw new WorkflowNonRetryableError(RUN_INACTIVE);
    // A previous attempt saved the result and failed before finishing the run: finish it with the saved result.
    const [saved, events] = await Promise.all([store().getResult(run.resultId), store().listProgress(runId, 0)]);
    return completeRun(run, run.resultId, saved?.result.isPartial === true, !events.some((e) => e.stage === 'done'));
  }
  if (isTerminal(run)) throw new WorkflowNonRetryableError(RUN_INACTIVE);

  const s = store();
  const [brand, ref, rows, curate, discover, evidence, rank, evalPlan, enrich, budget] = await Promise.all([
    loadBrandOrFail(run),
    loadRef(),
    s.listCandidates(runId),
    getCheckpoint<CurateCheckpoint>(runId, StepKey.curate),
    getCheckpoint<DiscoverCheckpoint>(runId, StepKey.discover),
    getCheckpoint<EvidenceCheckpoint>(runId, StepKey.evidence),
    getCheckpoint<RankCheckpoint>(runId, StepKey.rank),
    getCheckpoint<EvaluatePlanCheckpoint>(runId, StepKey.evaluatePlan),
    loadEnrichSummary(runId),
    budgetState(runId),
  ]);
  const { objective, budgetTHB, nCreators } = campaignOf(run);
  const ranked = sortByRank(rows);

  const evalBatches = Math.ceil((evalPlan?.creatorIds.length ?? 0) / BATCH_SIZE);
  const evalCheckpoints = await Promise.all(
    Array.from({ length: evalBatches }, (_, b) => getCheckpoint<EvaluateCheckpoint>(runId, StepKey.evaluate(b))),
  );
  const evalFailed = evalCheckpoints.reduce((n, cp) => n + (cp?.failed ?? 0), 0);
  const evalSkipped = evalCheckpoints.reduce((n, cp) => n + (cp?.skipped ?? 0), 0);
  // Creators without an LLM2b evaluation are excluded as not_evaluated (gate 0c never ran for them).
  const notEvaluated = evalFailed + evalSkipped;

  if (ranked.length === 0 || !curate) {
    const messageTh =
      enrich.fetched === 0 && enrich.failed > 0
        ? MSG.providerUnavailable
        : ranked.length === 0 && notEvaluated > 0
          ? MSG.evaluationUnavailable
          : MSG.noCandidates;
    await emitProgress(runId, { stage: run.stage ?? 'rank', status: 'failed', pct: run.progressPct, messageTh });
    await s.updateRun(runId, { status: 'failed', errorMessageTh: messageTh, completedAt: new Date().toISOString() });
    await releaseDedupe(run.ownerId, run.inputHash);
    const out: FinalizeCheckpoint = { resultId: null, status: 'failed' };
    await putCheckpoint(runId, StepKey.finalize, out);
    return out;
  }

  const poolMedians = poolMedianScores(ranked.map((r) => r.ranked));
  const curatedById = new Map(curate.items.map((it) => [it.creatorId, it]));
  const brandPillars = brand.brand.contentPillars;
  const recommendations = ranked.slice(0, nCreators).map((row, i) => {
    const categoryId = categoryFor(row, brand);
    const item = curatedById.get(row.creatorId) ?? codeOnlyCuration({ row, objective, ref, categoryId, status: 'failed' });
    return buildRecommendation({ rank: i + 1, row, item, poolMedians, ref, categoryId, covers: enrich.covers[row.creatorId] ?? {}, brandPillars });
  });
  // Alternatives must still fit the brand: a high total driven only by trust/cost (e.g. an off-category creator)
  // is not a useful substitute, so require brand fit of at least 60% of the weakest recommended creator's and a
  // content-relevance rubric of at least 1/2 ("has touched a nearby category") when the rubric exists.
  const minRecFit = Math.min(...ranked.slice(0, nCreators).map((r) => r.ranked.groups.fit));
  const fitFloor = Number.isFinite(minRecFit) ? ALTERNATIVE_FIT_FLOOR * minRecFit : 0;
  const alternatives = ranked
    .slice(nCreators)
    .filter((r) => r.ranked.groups.fit >= fitFloor && (r.ranked.sub.fit.relevance ?? 1) >= 0.5)
    .slice(0, ALTERNATIVES_COUNT)
    .map(buildAlternative);

  const budgetStopped = budget === 'hard' || curate.budgetStopped || evalSkipped > 0;
  const semanticFailed = rank ? !rank.semanticOk : false;
  const isPartial = budgetStopped || curate.failures > 0 || evalFailed > 0 || semanticFailed || enrich.failed > 0;

  const caveats: string[] = [];
  if (run.isDemo) caveats.push('ผลลัพธ์นี้สร้างจากข้อมูลสาธิต (ครีเอเตอร์และตัวเลขสมมติ) ไม่ใช่ข้อมูลจริง');
  caveats.push('ข้อมูลประชากรผู้ชมเป็นค่าประมาณความมั่นใจต่ำ จึงมีผลต่อคะแนนน้อย');
  if (discover?.relaxed) {
    caveats.push('พบครีเอเตอร์ที่ผ่านเกณฑ์น้อยกว่า 10 คน จึงผ่อนช่วงผู้ติดตาม (±50%) และนับการโพสต์ย้อนหลัง 60 วัน');
  }
  if (recommendations.length < nCreators) {
    caveats.push(`พบครีเอเตอร์ที่ผ่านเกณฑ์ ${recommendations.length} คน น้อยกว่าที่ต้องการ (${nCreators} คน)`);
  }
  if (budgetStopped) caveats.push(MSG.budgetHardWarning);
  if (curate.failures > 0) {
    caveats.push(`บทวิเคราะห์ของครีเอเตอร์ ${curate.failures} คนสร้างไม่สำเร็จ จึงแสดงเหตุผลจากคะแนนแทน`);
  }
  if (notEvaluated > 0) {
    caveats.push(`ครีเอเตอร์ ${notEvaluated} คนประเมินความเหมาะสมกับแบรนด์ไม่สำเร็จ จึงไม่นำมาแนะนำ เพราะยังไม่ได้ตรวจความปลอดภัยต่อแบรนด์`);
  }
  if (semanticFailed) caveats.push('คำนวณความใกล้เคียงของเนื้อหากับแบรนด์ไม่สำเร็จ จึงจัดอันดับจากคะแนนด้านอื่น');
  for (const w of run.warnings) if (!caveats.includes(w)) caveats.push(w);

  const docs = evidence?.docs ?? [];
  const dataSources = [
    ...new Set([
      discover ? (discover.providerMock ? 'demo_creators' : discover.providerName) : null,
      ...docs.map((d) => SOURCE_LABEL[d.sourceType] ?? d.sourceType),
      isAiConfigured() ? 'openai' : 'demo_ai',
    ].filter((x): x is string => typeof x === 'string' && x.length > 0)),
  ];
  const fetchedTimes = [...docs.map((d) => d.fetchedAt), ...ranked.map((r) => r.dossier.fetchedAt)].filter((t) => !Number.isNaN(Date.parse(t)));
  const generatedAt = new Date().toISOString();
  const dataAsOf = fetchedTimes.length > 0 ? fetchedTimes.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : generatedAt;

  const resultId = crypto.randomUUID();
  const result = FinalResult.parse(
    buildFinalResult({
      resultId,
      runId,
      version: 1,
      generatedAt,
      isDemo: run.isDemo,
      isPartial,
      brand,
      ref,
      objective,
      audienceSource: audienceSourceOf(briefOf(run)),
      weights: PRESETS[objective],
      budgetTHB,
      nCreators,
      recommendations,
      alternatives,
      plan: curate.plan,
      narrative: curate.narrative,
      baseActions: curate.baseActions,
      candidatesScanned: discover?.scanned ?? ranked.length,
      candidatesEvaluated: rows.filter((r) => r.evaluation !== null).length,
      dataSources,
      dataAsOf,
      caveatsTh: caveats,
      sourceDocs: docs,
    }),
  );
  await s.saveResult(result, run.ownerId);
  return completeRun(run, resultId, isPartial, true);
}

/** Marks a run failed (unless it already reached a terminal status, e.g. cancelled); safe to call more than once. */
export async function markRunFailed(runId: string, message: string): Promise<void> {
  const s = store();
  const run = await s.getRun(runId);
  if (!run || isTerminal(run)) return;
  const messageTh = toThaiError(message);
  await s.appendProgress(runId, { stage: run.stage ?? 'intake', status: 'failed', pct: run.progressPct, messageTh });
  await s.updateRun(runId, { status: 'failed', errorMessageTh: messageTh, completedAt: new Date().toISOString() });
  await releaseDedupe(run.ownerId, run.inputHash);
}
