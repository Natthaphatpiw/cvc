import type { CandidateRow } from '@cvc/db';
import { cacheCreatorImage } from '@cvc/media';
import { getKolProvider } from '@cvc/providers';
import { computeMetrics, estimateFee, gate0b, tierFor, type GateContext } from '@cvc/scoring';
import type { BrandProfile, CandidateRef, CreatorDossier, RefData } from '@cvc/schemas';
import { errorMessage, mapLimit } from '../../lib/async';
import {
  MSG,
  addWarnings,
  briefOf,
  buildGateContext,
  demoPause,
  emitProgress,
  getCheckpoint,
  loadActiveRun,
  loadBrandOrFail,
  loadRef,
  providerFailure,
  putCheckpoint,
  store,
} from '../context';
import { BATCH_SIZE, ENRICH_LIMIT, StepKey, type DiscoverCheckpoint, type EnrichCheckpoint } from '../types';

const VIDEOS_PER_CREATOR = 20;
const COVERS_PER_CREATOR = 3;

async function cacheImage(a: Parameters<typeof cacheCreatorImage>[0]): Promise<string | null> {
  try {
    return await cacheCreatorImage(a);
  } catch (err) {
    console.warn('[agent] cacheCreatorImage failed', a.kind, errorMessage(err));
    return null;
  }
}

type Enriched = { row: CandidateRow; covers: Record<string, string | null> };

async function enrichOne(candidate: CandidateRef, brand: BrandProfile, ref: RefData, gateCtx: GateContext): Promise<Enriched | null> {
  const provider = getKolProvider();
  const profile = await provider.getProfile(candidate.handle);
  if (!profile) return null;
  const videos = await provider.getVideos(profile.handle, VIDEOS_PER_CREATOR);
  const metrics = computeMetrics(videos, { followerCount: profile.followerCount });
  const tier = tierFor(profile.followerCount, ref.tierBands);
  const fee = estimateFee(tier, brand.brand.industryId, ref);

  const s = store();
  const creatorId = await s.upsertCreator(profile, { tier, avatarUrl: null, isDemo: provider.mock });
  const avatarUrl = await cacheImage({ creatorId, sourceUrl: profile.avatarSourceUrl, kind: 'avatar' });
  if (avatarUrl) await s.setCreatorAvatar(creatorId, avatarUrl, profile.avatarSourceUrl);

  const covers: Record<string, string | null> = {};
  const topByViews = [...videos].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, COVERS_PER_CREATOR);
  for (const v of topByViews) {
    covers[v.platformVideoId] = await cacheImage({ creatorId, sourceUrl: v.coverSourceUrl, kind: 'cover', key: v.platformVideoId });
  }
  await s.saveVideos(creatorId, videos, covers);

  const dossier: CreatorDossier = {
    creatorId,
    profile,
    tier,
    avatarUrl,
    videos,
    metrics,
    audience: null,
    collabs: [],
    categories: [],
    suitabilityTier: null,
    fetchedAt: new Date().toISOString(),
  };
  const gateFailures = gate0b(dossier, fee, gateCtx);
  return {
    covers,
    row: {
      creatorId,
      handle: profile.handle,
      status: gateFailures.length > 0 ? 'excluded' : 'enriched',
      candidateRef: candidate,
      dossier,
      evaluation: null,
      ranked: null,
      gateFailures,
      suspectedInjection: false,
      estFeeTHB: fee,
      semantic: null,
    },
  };
}

/** Enrich one batch of ≤ 5 of the top-25 candidates: profile, 20 videos, metrics, tier, fee, media cache, gate 0b. */
export async function enrichBatchStep(runId: string, batchIndex: number): Promise<{ enriched: number; excluded: number }> {
  const key = StepKey.enrich(batchIndex);
  const done = await getCheckpoint<EnrichCheckpoint>(runId, key);
  if (done) return { enriched: done.enriched, excluded: done.excluded };

  const run = await loadActiveRun(runId);
  const started = Date.now();
  const [brand, ref, discover] = await Promise.all([
    loadBrandOrFail(run),
    loadRef(),
    getCheckpoint<DiscoverCheckpoint>(runId, StepKey.discover),
  ]);
  const top = (discover?.refs ?? []).slice(0, ENRICH_LIMIT);
  const batch = top.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
  // Same relaxation as gate 0a, otherwise 0b would exclude everyone who passed 0a only because of it.
  const gateCtx = buildGateContext({ run, brief: briefOf(run), brand, ref, relaxed: discover?.relaxed === true });
  await demoPause(run);

  const errors: unknown[] = [];
  const results = await mapLimit(batch, BATCH_SIZE, async (candidate) => {
    try {
      return await enrichOne(candidate, brand, ref, gateCtx);
    } catch (err) {
      errors.push(err);
      console.warn('[agent] enrich failed', candidate.handle, errorMessage(err));
      return null;
    }
  });
  const failed = errors.length;
  const ok = results.filter((r): r is Enriched => r !== null);
  if (batch.length > 0 && failed === batch.length) {
    const earlier = await Promise.all(Array.from({ length: batchIndex }, (_, b) => getCheckpoint<EnrichCheckpoint>(runId, StepKey.enrich(b))));
    // Nothing could be fetched so far, so the provider is down or refusing the account. A refused account fails the run
    // at once; otherwise it is retried, and when the retries run out the run fails with this message, not "no candidates".
    if (earlier.every((cp) => !cp || cp.enriched + cp.excluded === 0)) throw providerFailure(errors, MSG.providerUnavailable);
  }
  if (ok.length > 0) await store().saveCandidates(runId, ok.map((r) => r.row));

  const out: EnrichCheckpoint = {
    enriched: ok.filter((r) => r.row.status === 'enriched').length,
    excluded: ok.filter((r) => r.row.status === 'excluded').length,
    failed,
    covers: Object.fromEntries(ok.map((r) => [r.row.creatorId, r.covers])),
  };
  await putCheckpoint(runId, key, out, { latencyMs: Date.now() - started });
  if (failed > 0) await addWarnings(runId, [MSG.enrichPartial]);

  const processed = Math.min(top.length, (batchIndex + 1) * BATCH_SIZE);
  const batches = Math.max(1, Math.ceil(top.length / BATCH_SIZE));
  await emitProgress(runId, {
    stage: 'discover',
    status: 'progress',
    pct: 50 + Math.round((14 * (batchIndex + 1)) / batches),
    messageTh: `เก็บข้อมูลโปรไฟล์และวิดีโอล่าสุดแล้ว ${processed}/${top.length} คน`,
  });
  return { enriched: out.enriched, excluded: out.excluded };
}
