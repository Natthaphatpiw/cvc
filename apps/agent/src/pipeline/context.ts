import type { AiCtx } from '@cvc/ai';
import { budget } from '@cvc/cache';
import { StoreError, getAgentStore, type RunRecord } from '@cvc/db';
import type { GateContext } from '@cvc/scoring';
import {
  STAGE_TO_STATUS,
  TERMINAL_STATUSES,
  type BrandProfile,
  type InputBrief,
  type MinMax,
  type ProgressEvent,
  type ProgressEventInput,
  type RefData,
  type RunInput,
} from '@cvc/schemas';
import { isThaiText, normalizeHandle } from '@cvc/thai';
import { FatalError, getWritable } from 'workflow';
import { demoStepDelayMs } from '../env';
import { delay } from '../lib/async';

export const RUN_INACTIVE = 'run_inactive';

export const MSG = {
  failedGeneric: 'การวิเคราะห์ล้มเหลว กรุณาลองใหม่อีกครั้ง',
  budgetHardWarning: 'ใช้งบประมาณการประมวลผลถึงเพดาน ระบบจึงหยุดขั้นตอนที่มีค่าใช้จ่ายและสรุปผลจากข้อมูลที่มี',
  budgetHardBeforeBrand: 'ใช้งบประมาณการประมวลผลเกินเพดานก่อนวิเคราะห์แบรนด์เสร็จ กรุณาลองใหม่อีกครั้ง',
  noCandidates: 'ไม่พบครีเอเตอร์ที่ผ่านเกณฑ์ ลองขยายช่วงผู้ติดตาม ลดข้อจำกัด หรือเพิ่มลิงก์ของแบรนด์แล้วลองใหม่',
  noUrls: 'ไม่มีลิงก์เว็บไซต์หรือโซเชียลของแบรนด์ ผลลัพธ์อาจแม่นยำน้อยลง',
  providerUnavailable: 'ดึงข้อมูลโปรไฟล์ครีเอเตอร์จากผู้ให้บริการข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้งในภายหลัง',
  evaluationUnavailable: 'ประเมินความเหมาะสมของครีเอเตอร์กับแบรนด์ไม่สำเร็จ จึงยังไม่มีครีเอเตอร์ที่แนะนำได้ กรุณาลองใหม่อีกครั้ง',
  enrichPartial: 'ดึงข้อมูลโปรไฟล์ครีเอเตอร์บางคนจากผู้ให้บริการข้อมูลไม่สำเร็จ ผลลัพธ์จึงมาจากครีเอเตอร์ที่ดึงข้อมูลได้เท่านั้น',
} as const;

export function store() {
  return getAgentStore();
}

export async function getRunOrFail(runId: string): Promise<RunRecord> {
  const run = await getAgentStore().getRun(runId);
  if (!run) throw new FatalError(`run ${runId} not found`);
  return run;
}

export function isTerminal(run: RunRecord): boolean {
  return TERMINAL_STATUSES.includes(run.status);
}

/** Stops the pipeline (without retries) once a run was cancelled or already finished. */
export async function loadActiveRun(runId: string): Promise<RunRecord> {
  const run = await getRunOrFail(runId);
  if (isTerminal(run)) throw new FatalError(RUN_INACTIVE);
  return run;
}

export async function getCheckpoint<T>(runId: string, key: string): Promise<T | null> {
  return getAgentStore().getStep<T>(runId, key);
}

export async function putCheckpoint(
  runId: string,
  key: string,
  output: unknown,
  meta?: { costUsd?: number; latencyMs?: number; model?: string },
): Promise<void> {
  await getAgentStore().putStep(runId, key, output, meta);
}

// ---------------------------------------------------------------------------------------------
// progress
// ---------------------------------------------------------------------------------------------

async function writeWorkflowStream(event: ProgressEvent): Promise<void> {
  try {
    const writer = getWritable<ProgressEvent>({ namespace: 'progress' }).getWriter();
    try {
      await writer.write(event);
    } finally {
      writer.releaseLock();
    }
  } catch {
    // Not running inside a workflow step (inline mode) or the stream is busy; the store is the source of truth.
  }
}

export async function closeWorkflowStream(): Promise<void> {
  try {
    await getWritable<ProgressEvent>({ namespace: 'progress' }).close();
  } catch {
    // inline mode or already closed
  }
}

/**
 * Appends a durable progress event and mirrors stage / status / pct onto the run row (polling fallback).
 * Throws FatalError(RUN_INACTIVE) when the run was cancelled meanwhile so the pipeline stops.
 */
export async function emitProgress(runId: string, e: ProgressEventInput): Promise<void> {
  const s = getAgentStore();
  const run = await s.getRun(runId);
  if (!run || isTerminal(run)) throw new FatalError(RUN_INACTIVE);
  const event = await s.appendProgress(runId, { ...e, pct: Math.round(e.pct) });
  if (e.stage !== 'done' && e.status !== 'failed') {
    try {
      await s.updateRun(runId, { status: STAGE_TO_STATUS[e.stage], stage: e.stage, progressPct: Math.round(e.pct) });
    } catch (err) {
      // A cancel that landed after the read above wins: the store refuses to put a terminal run back to running.
      if (err instanceof StoreError && err.code === 'conflict') throw new FatalError(RUN_INACTIVE);
      throw err;
    }
  }
  await writeWorkflowStream(event);
}

export async function addWarnings(runId: string, warnings: readonly string[]): Promise<void> {
  const fresh = warnings.filter((w) => w.trim().length > 0);
  if (fresh.length === 0) return;
  const s = getAgentStore();
  const run = await s.getRun(runId);
  if (!run) return;
  const merged = [...run.warnings];
  for (const w of fresh) if (!merged.includes(w)) merged.push(w);
  if (merged.length !== run.warnings.length) await s.updateRun(runId, { warnings: merged });
}

export async function demoPause(run: RunRecord): Promise<void> {
  if (!run.isDemo) return;
  const ms = demoStepDelayMs();
  if (ms > 0) await delay(ms);
}

// ---------------------------------------------------------------------------------------------
// budget + AI context
// ---------------------------------------------------------------------------------------------

export type BudgetState = 'ok' | 'soft' | 'hard';

export async function budgetState(runId: string): Promise<BudgetState> {
  try {
    return await budget.state(runId);
  } catch (err) {
    console.warn('[agent] budget state unavailable', err);
    return 'ok';
  }
}

/** Budget guard before a paid call; records the hard-stop warning once. */
export async function guardBudget(runId: string): Promise<BudgetState> {
  const state = await budgetState(runId);
  if (state === 'hard') await addWarnings(runId, [MSG.budgetHardWarning]);
  return state;
}

export type AiLedger = { ctx: AiCtx; spentUsd(): number; model(): string | undefined };

/** AiCtx whose usage callback feeds the Redis budget and runs.cost_usd. */
export function createAiCtx(runId: string): AiLedger {
  let spent = 0;
  let lastModel: string | undefined;
  const ctx: AiCtx = {
    runId,
    onUsage: async (u) => {
      spent += u.costUsd;
      lastModel = u.model;
      try {
        const total = await budget.add(runId, u.costUsd);
        await getAgentStore().updateRun(runId, { costUsd: Number(total.toFixed(4)) });
      } catch (err) {
        console.warn('[agent] cost accounting failed', err);
      }
    },
  };
  return { ctx, spentUsd: () => Number(spent.toFixed(4)), model: () => lastModel };
}

// ---------------------------------------------------------------------------------------------
// reference data + run context
// ---------------------------------------------------------------------------------------------

let refCache: { at: number; data: Promise<RefData> } | null = null;

export function loadRef(): Promise<RefData> {
  if (!refCache || Date.now() - refCache.at > 10 * 60_000) {
    const data = getAgentStore()
      .loadRefData()
      .catch((err: unknown) => {
        refCache = null;
        throw err;
      });
    refCache = { at: Date.now(), data };
  }
  return refCache.data;
}

/** Deterministic InputBrief used when LLM0 is unavailable or fails. */
export function briefFromInput(input: RunInput): InputBrief {
  const voice = input.voiceTranscripts.map((v) => v.text.trim()).filter((t) => t.length > 0);
  const voiceText = voice.length > 0 ? voice.join('\n') : null;
  const missing: string[] = [];
  if (!input.websiteUrl) missing.push('websiteUrl');
  if (!input.facebookUrl) missing.push('facebookUrl');
  if (!input.tiktokUrl) missing.push('tiktokUrl');
  if (input.personaIds.length === 0 && !input.audienceNotes) missing.push('targetAudience');
  if (!input.campaign.budgetTHB) missing.push('budgetTHB');
  return {
    company: { name: input.companyName, nameTh: isThaiText(input.companyName) ? input.companyName : null, aliases: [] },
    urls: {
      website: input.websiteUrl,
      facebook: input.facebookUrl,
      tiktok: input.tiktokUrl,
      youtube: input.youtubeUrl,
      instagram: input.instagramUrl,
      others: [],
    },
    targetAudience: { personaIds: input.personaIds, freeText: input.audienceNotes, fromVoice: voiceText, fromImages: null },
    campaign: {
      objective: input.campaign.objective,
      budgetTHB: input.campaign.budgetTHB,
      nCreators: input.campaign.nCreators,
      preferredTiers: input.campaign.preferredTiers,
    },
    constraints: {
      competitors: input.exclusions.competitors,
      excludeHandles: input.exclusions.handles.map(normalizeHandle),
      mustInclude: [],
    },
    imageFindings: [],
    voiceTranscript: voiceText,
    missingFields: missing,
    confidence: 0.4,
  };
}

export function briefOf(run: RunRecord): InputBrief {
  return run.normalizedInput ?? briefFromInput(run.input);
}

export async function loadBrandOrFail(run: RunRecord): Promise<BrandProfile> {
  if (!run.brandProfileId) throw new FatalError('brand profile missing');
  const brand = await getAgentStore().getBrandProfile(run.brandProfileId);
  if (!brand) throw new FatalError('brand profile missing');
  return brand;
}

/**
 * Campaign settings of the normalized brief: LLM0 only fills values the form left at their defaults (mergeBriefHints),
 * so explicit form values still win, and every step sees the same campaign.
 */
export function campaignOf(run: RunRecord) {
  const c = briefOf(run).campaign;
  return { objective: c.objective, budgetTHB: c.budgetTHB, nCreators: c.nCreators, preferredTiers: c.preferredTiers };
}

const uniq = (xs: readonly string[]): string[] => [...new Set(xs.filter((x) => x.trim().length > 0))];

function validRange(r: MinMax | null | undefined): MinMax | null {
  if (!r || !Number.isFinite(r.min) || !Number.isFinite(r.max) || r.max <= 0 || r.min < 0 || r.max < r.min) return null;
  return r;
}

/**
 * Gate context for 0a/0b/0c. `relaxed` (§4.12: fewer than 10 candidates after gate 0a) widens the follower range by
 * ±50% and the activity window from 30 to 60 days; `now` stays real so the 90-day video count and the competitor
 * exclusivity window are unchanged. Gate 0b must get the same `relaxed` flag as gate 0a.
 */
export function buildGateContext(a: { run: RunRecord; brief: InputBrief; brand: BrandProfile; ref: RefData; relaxed?: boolean }): GateContext {
  const { run, brief, brand, ref } = a;
  const range = validRange(brand.creatorRequirements.followers);
  const campaign = campaignOf(run);
  return {
    now: new Date(),
    activeDays: a.relaxed ? 60 : 30,
    followerRange: range && a.relaxed ? { min: Math.floor(range.min * 0.5), max: Math.ceil(range.max * 1.5) } : range,
    excludeHandles: uniq(
      [...brief.constraints.excludeHandles, ...brand.creatorRequirements.excludeHandles, ...run.input.exclusions.handles].map(normalizeHandle),
    ),
    blockedHandles: [],
    competitors: uniq([...brief.constraints.competitors, ...brand.creatorRequirements.competitorBrands, ...run.input.exclusions.competitors]),
    exclusivityWindowDays: brand.creatorRequirements.exclusivityWindowDays,
    budgetPerCreatorTHB: campaign.budgetTHB ? campaign.budgetTHB.max / Math.max(1, campaign.nCreators) : null,
    minVideos90d: 8,
    brandSafetyLevel: brand.creatorRequirements.brandSafetyLevel,
    categoryPolicy: Object.fromEntries(ref.categories.map((c) => [c.id, c.tiktokBcPolicy])),
  };
}

/** Error message for runs.error_message: Thai messages pass through, anything else becomes the generic Thai text. */
export function toThaiError(message: string): string {
  return message && isThaiText(message) ? message : MSG.failedGeneric;
}
