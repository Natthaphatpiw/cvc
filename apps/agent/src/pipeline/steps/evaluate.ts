import { evaluateCreator, screenInjection } from '@cvc/ai';
import type { CandidateRow } from '@cvc/db';
import { gate0c } from '@cvc/scoring';
import type { KolEvaluation, KolPreview } from '@cvc/schemas';
import { errorMessage, mapLimit } from '../../lib/async';
import { discoveryOrder } from '../candidates';
import {
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
  store,
} from '../context';
import {
  BATCH_SIZE,
  StepKey,
  type DiscoverCheckpoint,
  type EvaluateCheckpoint,
  type EvaluatePlanCheckpoint,
} from '../types';

const PREVIEW_COUNT = 6;
/**
 * Gate failure for a creator whose LLM2b evaluation failed or was skipped by the budget guard: the brand-safety checks
 * of gate 0c (suitability, possible minor, prohibited categories) never ran, so the creator must not be recommended.
 */
const NOT_EVALUATED = 'not_evaluated';

/** Freezes the list of creators to evaluate (gate 0b passed) and shows the first previews. */
export async function planEvaluationStep(runId: string): Promise<{ batchCount: number }> {
  const done = await getCheckpoint<EvaluatePlanCheckpoint>(runId, StepKey.evaluatePlan);
  if (done) return { batchCount: Math.ceil(done.creatorIds.length / BATCH_SIZE) };

  await loadActiveRun(runId);
  const [rows, discover] = await Promise.all([store().listCandidates(runId), getCheckpoint<DiscoverCheckpoint>(runId, StepKey.discover)]);
  const eligible = discoveryOrder(
    rows.filter((r) => r.status === 'enriched' && r.dossier !== null),
    discover,
  );
  const out: EvaluatePlanCheckpoint = { creatorIds: eligible.map((r) => r.creatorId) };
  await putCheckpoint(runId, StepKey.evaluatePlan, out);

  const preview: KolPreview[] = eligible.slice(0, PREVIEW_COUNT).map((r) => ({
    creatorId: r.creatorId,
    handle: r.handle,
    avatarUrl: r.dossier?.avatarUrl ?? null,
    followers: r.dossier?.profile.followerCount ?? null,
  }));
  await emitProgress(runId, {
    stage: 'discover',
    status: 'completed',
    pct: 65,
    messageTh: `ได้ข้อมูลครบสำหรับครีเอเตอร์ ${eligible.length} คนที่ผ่านเงื่อนไขงบและความสม่ำเสมอ`,
    partial: { candidatesFound: eligible.length, preview },
  });
  if (eligible.length > 0) {
    await emitProgress(runId, { stage: 'evaluate', status: 'started', pct: 66, messageTh: 'กำลังประเมินความเหมาะสมของครีเอเตอร์แต่ละคนกับแบรนด์' });
  }
  return { batchCount: Math.ceil(out.creatorIds.length / BATCH_SIZE) };
}

/** Injection screen + LLM2b evaluator + gate 0c for one batch of ≤ 5 creators. */
export async function evaluateBatchStep(runId: string, batchIndex: number): Promise<{ evaluated: number; excluded: number }> {
  const key = StepKey.evaluate(batchIndex);
  const done = await getCheckpoint<EvaluateCheckpoint>(runId, key);
  if (done) return { evaluated: done.evaluated, excluded: done.excluded };

  const run = await loadActiveRun(runId);
  const started = Date.now();
  const [brand, ref, plan, rows] = await Promise.all([
    loadBrandOrFail(run),
    loadRef(),
    getCheckpoint<EvaluatePlanCheckpoint>(runId, StepKey.evaluatePlan),
    store().listCandidates(runId),
  ]);
  const ids = (plan?.creatorIds ?? []).slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
  const byId = new Map(rows.map((r) => [r.creatorId, r]));
  const batch = ids.map((id) => byId.get(id)).filter((r): r is CandidateRow => r !== undefined && r.dossier !== null);
  const gateCtx = buildGateContext({ run, brief: briefOf(run), brand, ref });
  const ledger = createAiCtx(runId);
  await demoPause(run);

  let failed = 0;
  let skipped = 0;
  const updated = await mapLimit(batch, BATCH_SIZE, async (row): Promise<CandidateRow> => {
    const dossier = row.dossier;
    if (!dossier) return row;
    if ((await guardBudget(runId)) === 'hard') {
      skipped += 1;
      return { ...row, status: 'excluded', gateFailures: [...row.gateFailures, NOT_EVALUATED] };
    }
    let suspected = false;
    try {
      suspected = (await screenInjection(dossier, ledger.ctx)).suspected;
    } catch (err) {
      console.warn('[agent] screenInjection failed', row.handle, errorMessage(err));
    }
    let evaluation: KolEvaluation | null = null;
    try {
      evaluation = await evaluateCreator(brand, dossier, ledger.ctx);
    } catch (err) {
      failed += 1;
      console.warn('[agent] evaluateCreator failed', row.handle, errorMessage(err));
    }
    if (!evaluation) {
      return { ...row, status: 'excluded', suspectedInjection: suspected, gateFailures: [...row.gateFailures, NOT_EVALUATED] };
    }
    const gateFailures = gate0c(evaluation, gateCtx);
    return {
      ...row,
      status: gateFailures.length > 0 ? 'excluded' : 'evaluated',
      evaluation,
      suspectedInjection: suspected,
      gateFailures: [...row.gateFailures, ...gateFailures],
      dossier: { ...dossier, categories: evaluation.categoryTags, suitabilityTier: evaluation.suitabilityTier },
    };
  });
  if (updated.length > 0) await store().saveCandidates(runId, updated);

  const out: EvaluateCheckpoint = {
    evaluated: updated.filter((r) => r.status === 'evaluated').length,
    excluded: updated.filter((r) => r.status === 'excluded').length,
    failed,
    skipped,
  };
  await putCheckpoint(runId, key, out, { costUsd: ledger.spentUsd(), latencyMs: Date.now() - started, model: ledger.model() });

  const total = plan?.creatorIds.length ?? 0;
  const processed = Math.min(total, (batchIndex + 1) * BATCH_SIZE);
  await emitProgress(runId, {
    stage: 'evaluate',
    status: 'progress',
    pct: 66 + Math.round((14 * processed) / Math.max(1, total)),
    messageTh: `ประเมินความเหมาะสมแล้ว ${processed}/${total} คน`,
  });
  return { evaluated: out.evaluated, excluded: out.excluded };
}
