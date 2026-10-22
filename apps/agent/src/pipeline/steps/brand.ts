import { researchBrand } from '@cvc/ai';
import type { BrandProfile, InputBrief, RunInput } from '@cvc/schemas';
import { normalizeHandle } from '@cvc/thai';
import { WorkflowNonRetryableError } from '@upstash/workflow';
import {
  MSG,
  briefOf,
  createAiCtx,
  demoPause,
  emitProgress,
  getCheckpoint,
  guardBudget,
  loadActiveRun,
  loadRef,
  putCheckpoint,
  store,
} from '../context';
import { brandCard } from '../text';
import { StepKey, type BrandCheckpoint } from '../types';

const uniq = (xs: string[]): string[] => [...new Set(xs.filter((x) => x.trim().length > 0))];

/**
 * The campaign of the normalized brief (form values, plus LLM0 hints where the form kept its defaults) and the user's
 * exclusions are authoritative over what LLM1 inferred.
 */
function applyUserConstraints(brand: BrandProfile, input: RunInput, c: InputBrief['campaign']): BrandProfile {
  return {
    ...brand,
    campaign: {
      ...brand.campaign,
      objective: c.objective,
      budgetTHB: c.budgetTHB ?? brand.campaign.budgetTHB,
      nCreators: c.nCreators,
      preferredTiers: c.preferredTiers.length > 0 ? c.preferredTiers : brand.campaign.preferredTiers,
    },
    creatorRequirements: {
      ...brand.creatorRequirements,
      excludeHandles: uniq([...brand.creatorRequirements.excludeHandles, ...input.exclusions.handles].map(normalizeHandle)),
      competitorBrands: uniq([...brand.creatorRequirements.competitorBrands, ...input.exclusions.competitors]),
    },
    scoringPreset: c.objective,
  };
}

/** LLM1 Brand Intelligence → analysis.brand_profiles; emits the brand card for the progress UI. */
export async function brandStep(runId: string): Promise<BrandCheckpoint> {
  const done = await getCheckpoint<BrandCheckpoint>(runId, StepKey.brand);
  if (done) return done;

  const run = await loadActiveRun(runId);
  const started = Date.now();
  // A retried step (time limit, provider error) runs again without web search: it is the slow, network-bound part,
  // and the evidence cards plus the model still produce a usable profile.
  const isRetry = (await store().listProgress(runId, 0)).some((e) => e.stage === 'brand' && e.status === 'started');
  await emitProgress(runId, {
    stage: 'brand',
    status: 'started',
    pct: 22,
    messageTh: isRetry
      ? 'กำลังวิเคราะห์แบรนด์อีกครั้ง โดยใช้ข้อมูลที่ดึงมาแล้ว (ไม่ค้นเว็บเพิ่ม)'
      : 'กำลังวิเคราะห์แบรนด์ สินค้า และกลุ่มเป้าหมาย',
  });
  await demoPause(run);

  const state = await guardBudget(runId);
  if (state === 'hard') throw new WorkflowNonRetryableError(MSG.budgetHardBeforeBrand);

  const [evidence, personas, ref] = await Promise.all([
    store().listEvidence(runId),
    store().listPersonas(run.input.personaIds),
    loadRef(),
  ]);
  const ledger = createAiCtx(runId);
  const brief = briefOf(run);
  const researched = await researchBrand(
    { brief, evidence, personas, categories: ref.categories, allowWebSearch: state === 'ok' && !isRetry },
    ledger.ctx,
  );
  const brand = applyUserConstraints(researched, run.input, brief.campaign);
  const brandProfileId = await store().saveBrandProfile(runId, brand);
  await store().updateRun(runId, { brandProfileId });

  const out: BrandCheckpoint = { brandProfileId };
  await putCheckpoint(runId, StepKey.brand, out, { costUsd: ledger.spentUsd(), latencyMs: Date.now() - started, model: ledger.model() });
  await emitProgress(runId, {
    stage: 'brand',
    status: 'completed',
    pct: 35,
    messageTh: `วิเคราะห์แบรนด์ ${brand.brand.name} เสร็จแล้ว`,
    partial: { brand: brandCard(brand, ref) },
  });
  return out;
}
