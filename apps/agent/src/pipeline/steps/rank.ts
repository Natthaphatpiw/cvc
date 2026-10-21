import { cosine, embed } from '@cvc/ai';
import type { CandidateRow } from '@cvc/db';
import { PRESETS, scoreCandidates, seedFrom, type EvaluatedCandidate, type ScoringContext } from '@cvc/scoring';
import type { BrandProfile, CreatorDossier } from '@cvc/schemas';
import { errorMessage } from '../../lib/async';
import {
  addWarnings,
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
import { StepKey, type RankCheckpoint } from '../types';

const CAPTIONS_PER_CREATOR = 10;
const TEXT_LIMIT = 500;

function creatorTexts(d: CreatorDossier): string[] {
  const captions = d.videos
    .map((v) => [v.caption ?? '', v.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')].join(' ').trim())
    .filter((t) => t.length > 0)
    .slice(0, CAPTIONS_PER_CREATOR);
  if (captions.length === 0 && d.profile.bio) captions.push(d.profile.bio);
  return captions.map((t) => t.slice(0, TEXT_LIMIT));
}

/**
 * Semantic fit per creator (§6.3): for each brand criterion take the max cosine against the creator's caption vectors,
 * then the criterion-weighted mean. One embedding call per run.
 */
async function semanticScores(brand: BrandProfile, rows: CandidateRow[], ledger: ReturnType<typeof createAiCtx>): Promise<Map<string, number>> {
  const criteria = brand.matchingQueries.criteria
    .map((c) => ({ text: (c.textTh || c.textEn).slice(0, TEXT_LIMIT), weight: c.weight > 0 ? c.weight : 1 }))
    .filter((c) => c.text.trim().length > 0);
  const perCreator = rows.map((r) => ({ id: r.creatorId, texts: r.dossier ? creatorTexts(r.dossier) : [] }));
  const texts = [...criteria.map((c) => c.text), ...perCreator.flatMap((p) => p.texts)];
  const out = new Map<string, number>();
  if (criteria.length === 0 || texts.length === criteria.length) return out;

  const vectors = await embed(texts, ledger.ctx);
  const criterionVectors = vectors.slice(0, criteria.length);
  let offset = criteria.length;
  for (const p of perCreator) {
    const own = vectors.slice(offset, offset + p.texts.length);
    offset += p.texts.length;
    if (own.length === 0) continue;
    let weighted = 0;
    let weights = 0;
    criterionVectors.forEach((q, j) => {
      const w = criteria[j]?.weight ?? 1;
      weighted += w * Math.max(...own.map((v) => cosine(q, v)));
      weights += w;
    });
    if (weights > 0) out.set(p.id, weighted / weights);
  }
  return out;
}

function brandAudience(brand: BrandProfile): ScoringContext['brandAudience'] {
  const seg = brand.audience.segments[0];
  if (!seg) return null;
  const ageDist = Object.keys(seg.ageDist).length > 0 ? seg.ageDist : null;
  const genderDist = Object.keys(seg.genderDist).length > 0 ? seg.genderDist : null;
  return ageDist || genderDist ? { ageDist, genderDist } : null;
}

/** Code ranking: semantic fit + scoreCandidates with the objective preset (§6). */
export async function rankStep(runId: string): Promise<RankCheckpoint> {
  'use step';
  const done = await getCheckpoint<RankCheckpoint>(runId, StepKey.rank);
  if (done) return done;

  const run = await loadActiveRun(runId);
  const started = Date.now();
  await emitProgress(runId, { stage: 'rank', status: 'started', pct: 82, messageTh: 'กำลังจัดอันดับด้วยคะแนน 5 ด้าน' });
  await demoPause(run);
  const [brand, ref, rows] = await Promise.all([loadBrandOrFail(run), loadRef(), store().listCandidates(runId)]);
  const pool = rows.filter((r) => (r.status === 'evaluated' || r.status === 'ranked') && r.dossier !== null);

  const ledger = createAiCtx(runId);
  let semantic = new Map<string, number>();
  let semanticOk = false;
  if (pool.length > 0 && (await guardBudget(runId)) !== 'hard') {
    try {
      semantic = await semanticScores(brand, pool, ledger);
      semanticOk = true;
    } catch (err) {
      console.warn('[agent] semantic scoring failed', errorMessage(err));
      await addWarnings(runId, ['คำนวณความใกล้เคียงของเนื้อหากับแบรนด์ไม่สำเร็จ จึงจัดอันดับจากคะแนนด้านอื่น']);
    }
  }

  const { objective } = campaignOf(run);
  const evaluated: EvaluatedCandidate[] = [];
  for (const r of pool) {
    if (!r.dossier) continue;
    evaluated.push({
      dossier: r.dossier,
      evaluation: r.evaluation,
      semantic: semantic.get(r.creatorId) ?? null,
      suspectedInjection: r.suspectedInjection,
      estFeeTHB: r.estFeeTHB ?? { min: 0, max: 0 },
      gateFailures: [],
    });
  }
  const ctx: ScoringContext = {
    weights: PRESETS[objective],
    objective,
    brandCategories: [
      ...new Set([brand.brand.industryId, ...brand.brand.subCategories, ...brand.creatorRequirements.mustCategories, ...brand.creatorRequirements.niceCategories]),
    ],
    brandAudience: brandAudience(brand),
    brandSafetyLevel: brand.creatorRequirements.brandSafetyLevel,
    ref,
    seed: seedFrom(runId),
  };
  const ranked = evaluated.length > 0 ? scoreCandidates(evaluated, ctx) : [];

  const byId = new Map(pool.map((r) => [r.creatorId, r]));
  const updates: CandidateRow[] = [];
  for (const rc of ranked) {
    const row = byId.get(rc.creatorId);
    if (row) updates.push({ ...row, status: 'ranked', ranked: rc, semantic: semantic.get(rc.creatorId) ?? null });
  }
  if (updates.length > 0) await store().saveCandidates(runId, updates);

  const out: RankCheckpoint = { ranked: ranked.length, semanticOk };
  await putCheckpoint(runId, StepKey.rank, out, { costUsd: ledger.spentUsd(), latencyMs: Date.now() - started, model: ledger.model() });
  await emitProgress(runId, {
    stage: 'rank',
    status: 'completed',
    pct: 86,
    messageTh: `จัดอันดับครีเอเตอร์ ${ranked.length} คนเรียบร้อย`,
  });
  return out;
}
