import { curateCreator, curatePortfolio } from '@cvc/ai';
import { baseNextActions, buildPortfolioPlan } from '@cvc/scoring';
import type { PortfolioNarrative } from '@cvc/schemas';
import { errorMessage, mapLimit } from '../../lib/async';
import { categoryFor, codeOnlyCuration, sortByRank } from '../assemble';
import {
  campaignOf,
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
import { ROLE_TH } from '../text';
import { StepKey, type CurateCheckpoint, type CuratedItem } from '../types';

const CURATE_CONCURRENCY = 5;

/** LLM4 for the top N (narrative only) + code KPIs, playbook hints, portfolio plan and next actions. */
export async function curateStep(runId: string): Promise<{ curated: number; failures: number }> {
  const done = await getCheckpoint<CurateCheckpoint>(runId, StepKey.curate);
  if (done) return { curated: done.items.length, failures: done.failures };

  const run = await loadActiveRun(runId);
  const started = Date.now();
  const { objective, budgetTHB, nCreators } = campaignOf(run);
  const [brand, ref, rows] = await Promise.all([loadBrandOrFail(run), loadRef(), store().listCandidates(runId)]);
  const top = sortByRank(rows).slice(0, nCreators);
  await emitProgress(runId, {
    stage: 'curate',
    status: 'started',
    pct: 88,
    messageTh: `กำลังเขียนบทวิเคราะห์และแผนการทำงานกับครีเอเตอร์ ${top.length} คน`,
  });
  await demoPause(run);

  const ledger = createAiCtx(runId);
  const state = await guardBudget(runId);
  let failures = 0;
  const items = await mapLimit(top, CURATE_CONCURRENCY, async (row): Promise<CuratedItem> => {
    const base = codeOnlyCuration({ row, objective, ref, categoryId: categoryFor(row, brand), status: 'failed' });
    if (state === 'hard' || (await guardBudget(runId)) === 'hard') {
      failures += 1;
      return base;
    }
    try {
      const curator = await curateCreator(
        { brand, dossier: row.dossier, ranked: row.ranked, evaluation: row.evaluation, hints: base.hints, kpis: base.kpis },
        ledger.ctx,
      );
      return { ...base, status: 'ready', curator };
    } catch (err) {
      failures += 1;
      console.warn('[agent] curateCreator failed', row.handle, errorMessage(err));
      return base;
    }
  });

  const plan = buildPortfolioPlan({
    objective,
    budgetTHB,
    items: items.map((it, i) => ({
      creatorId: it.creatorId,
      handle: top[i]?.handle ?? '',
      fee: top[i]?.estFeeTHB ?? it.kpis.cost.feeTHB,
      kpis: it.kpis,
      role: it.hints.role,
    })),
  });

  let narrative: PortfolioNarrative | null = null;
  if (items.length > 0 && (await guardBudget(runId)) === 'ok') {
    try {
      narrative = await curatePortfolio(
        {
          brand,
          plan,
          picks: items.map((it, i) => ({
            handle: top[i]?.handle ?? '',
            role: it.hints.role,
            whyTh: it.curator?.whyMatchTh[0]?.text ?? `บท${ROLE_TH[it.hints.role]}`,
          })),
        },
        ledger.ctx,
      );
    } catch (err) {
      console.warn('[agent] curatePortfolio failed', errorMessage(err));
    }
  }
  const baseActions = baseNextActions({ objective, creators: top.map((r) => ({ creatorId: r.creatorId, handle: r.handle })) });

  const out: CurateCheckpoint = { items, plan, narrative, baseActions, failures, budgetStopped: state === 'hard' };
  await putCheckpoint(runId, StepKey.curate, out, { costUsd: ledger.spentUsd(), latencyMs: Date.now() - started, model: ledger.model() });
  await emitProgress(runId, { stage: 'curate', status: 'completed', pct: 97, messageTh: 'สรุปแผนการใช้ครีเอเตอร์และตัวเลขคาดการณ์เรียบร้อย' });
  return { curated: items.length, failures };
}
