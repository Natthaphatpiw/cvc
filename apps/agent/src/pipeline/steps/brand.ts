import { researchBrand } from '@cvc/ai';
import type { BrandProfile, InputBrief, RunInput } from '@cvc/schemas';
import { normalizeHandle } from '@cvc/thai';
import { WorkflowNonRetryableError } from '@upstash/workflow';
import {
  MSG,
  audienceSourceOf,
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
import { OBJECTIVE_LABEL_TH, brandCard } from '../text';
import { StepKey, type BrandCheckpoint } from '../types';

const uniq = (xs: string[]): string[] => [...new Set(xs.filter((x) => x.trim().length > 0))];

/**
 * The campaign of the normalized brief (form values, plus LLM0 hints for values the client left to the agent) and the
 * user's exclusions are authoritative over what LLM1 inferred. An objective or creator count left to the agent
 * ('inferred') keeps LLM1's campaignSuggestion, which mapLlmBrandProfile put on the profile.
 */
export function applyUserConstraints(brand: BrandProfile, input: RunInput, c: InputBrief['campaign']): BrandProfile {
  const objectiveInferred = c.objectiveSource === 'inferred';
  const nCreatorsInferred = c.nCreatorsSource === 'inferred';
  const objective = objectiveInferred ? brand.campaign.objective : c.objective;
  const suggested = brand.campaign.nCreators;
  return {
    ...brand,
    campaign: {
      ...brand.campaign,
      objective,
      objectiveSource: objectiveInferred ? 'inferred' : 'user',
      objectiveReasonTh: objectiveInferred ? (brand.campaign.objectiveReasonTh ?? '') : '',
      budgetTHB: c.budgetTHB ?? brand.campaign.budgetTHB,
      nCreators: nCreatorsInferred ? (Number.isInteger(suggested) ? Math.min(10, Math.max(1, suggested)) : 5) : c.nCreators,
      nCreatorsSource: nCreatorsInferred ? 'inferred' : 'user',
      preferredTiers: c.preferredTiers.length > 0 ? c.preferredTiers : brand.campaign.preferredTiers,
    },
    creatorRequirements: {
      ...brand.creatorRequirements,
      excludeHandles: uniq([...brand.creatorRequirements.excludeHandles, ...input.exclusions.handles].map(normalizeHandle)),
      competitorBrands: uniq([...brand.creatorRequirements.competitorBrands, ...input.exclusions.competitors]),
    },
    scoringPreset: objective,
  };
}

/**
 * The brief with the campaign values the agent chose, or null when the client set them all. The sources stay
 * 'inferred' so the result can say what the agent chose.
 */
export function resolvedBrief(brief: InputBrief, brand: BrandProfile): InputBrief | null {
  const c = brief.campaign;
  const objectiveInferred = c.objectiveSource === 'inferred';
  const nCreatorsInferred = c.nCreatorsSource === 'inferred';
  if (!objectiveInferred && !nCreatorsInferred) return null;
  return {
    ...brief,
    campaign: {
      ...c,
      objective: objectiveInferred ? brand.campaign.objective : c.objective,
      nCreators: nCreatorsInferred ? brand.campaign.nCreators : c.nCreators,
    },
  };
}

/** Progress line that tells the client what the agent chose for them, or null when nothing was left to it. */
export function inferredMessageTh(brief: InputBrief, brand: BrandProfile): string | null {
  const parts = [
    audienceSourceOf(brief) === 'inferred' ? 'วิเคราะห์กลุ่มลูกค้าจากข้อมูลของแบรนด์ให้' : '',
    brief.campaign.objectiveSource === 'inferred' ? `เลือกเป้าหมายแคมเปญให้: ${OBJECTIVE_LABEL_TH[brand.campaign.objective]}` : '',
    brief.campaign.nCreatorsSource === 'inferred' ? `แนะนำจำนวนครีเอเตอร์: ${brand.campaign.nCreators} คน` : '',
  ].filter((p) => p.length > 0);
  return parts.length > 0 ? `ระบบ${parts.join(' · ')}` : null;
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

  const brief = briefOf(run);
  const personaIds = brief.targetAudience.personaIds;
  // With no persona selected, LLM1 gets the whole catalog as naming reference for the segments it infers.
  const [evidence, personas, ref] = await Promise.all([
    store().listEvidence(runId),
    store().listPersonas(personaIds.length > 0 ? personaIds : undefined),
    loadRef(),
  ]);
  const ledger = createAiCtx(runId);
  const researched = await researchBrand(
    { brief, evidence, personas, categories: ref.categories, allowWebSearch: state === 'ok' && !isRetry },
    ledger.ctx,
  );
  const brand = applyUserConstraints(researched, run.input, brief.campaign);
  const brandProfileId = await store().saveBrandProfile(runId, brand);
  // The values the agent chose go back into the brief before the checkpoint, so campaignOf() in every later step
  // (and a replay of this one) sees them.
  const resolved = resolvedBrief(brief, brand);
  await store().updateRun(runId, resolved ? { brandProfileId, normalizedInput: resolved } : { brandProfileId });

  const out: BrandCheckpoint = { brandProfileId };
  await putCheckpoint(runId, StepKey.brand, out, { costUsd: ledger.spentUsd(), latencyMs: Date.now() - started, model: ledger.model() });
  // The stage list shows only a stage's last message, so what the agent chose rides on the completed event.
  const inferredTh = inferredMessageTh(brief, brand);
  const doneTh = `วิเคราะห์แบรนด์ ${brand.brand.name} เสร็จแล้ว`;
  await emitProgress(runId, {
    stage: 'brand',
    status: 'completed',
    pct: 35,
    messageTh: inferredTh ? `${doneTh} · ${inferredTh}` : doneTh,
    partial: { brand: brandCard(brand, ref) },
  });
  return out;
}
