import { summarizeSource } from '@cvc/ai';
import { getClientIntelProvider, type SourceDoc } from '@cvc/providers';
import type { EvidenceCard } from '@cvc/schemas';
import { errorMessage, withTimeout } from '../../lib/async';
import {
  addWarnings,
  briefOf,
  createAiCtx,
  demoPause,
  emitProgress,
  getCheckpoint,
  guardBudget,
  loadActiveRun,
  putCheckpoint,
  store,
} from '../context';
import {
  SOURCE_KINDS,
  StepKey,
  type EvidenceCheckpoint,
  type NormalizeCheckpoint,
  type PrefetchCheckpoint,
  type SourceKind,
  type SourceRef,
} from '../types';

const LABEL_TH: Record<SourceKind, string> = {
  website: 'เว็บไซต์ของแบรนด์',
  facebook: 'เพจ Facebook ของแบรนด์',
  tiktok: 'TikTok ของแบรนด์',
};

const TIMEOUT_MS: Record<SourceKind, number> = {
  website: 90_000,
  // the provider stops scraping at 120 s and returns what it has
  facebook: 130_000,
  tiktok: 60_000,
};

const MAX_DOCS_PER_SOURCE = 6;
const MERGE_THRESHOLD = 3;
const MERGED_TEXT_LIMIT = 24_000;

/** Many small docs of one type (e.g. 30 posts) are merged into one so the summarizer runs a bounded number of times. */
function compactDocs(docs: SourceDoc[]): SourceDoc[] {
  const groups = new Map<string, SourceDoc[]>();
  for (const d of docs) {
    const g = groups.get(d.sourceType) ?? [];
    g.push(d);
    groups.set(d.sourceType, g);
  }
  const out: SourceDoc[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.length <= MERGE_THRESHOLD) {
      out.push(...group);
      continue;
    }
    out.push({
      ...first,
      title: `${first.title} (+${group.length - 1})`,
      text: group
        .map((d) => d.text)
        .join('\n\n---\n\n')
        .slice(0, MERGED_TEXT_LIMIT),
      meta: { mergedCount: group.length },
    });
  }
  return out.slice(0, MAX_DOCS_PER_SOURCE);
}

async function fetchDocs(source: SourceKind, url: string): Promise<SourceDoc[]> {
  const provider = getClientIntelProvider();
  switch (source) {
    case 'website':
      return withTimeout(provider.crawlWebsite(url, 5), TIMEOUT_MS.website, 'website');
    case 'facebook':
      return withTimeout(provider.facebookPage(url, 30, 120), TIMEOUT_MS.facebook, 'facebook');
    case 'tiktok':
      return withTimeout(provider.tiktokProfile(url), TIMEOUT_MS.tiktok, 'tiktok');
  }
}

/**
 * Pre-fetch one client source and summarize it into evidence cards in the same step, so raw page text never has to be
 * persisted between steps (§4.4, §4.12 privacy). Optional and failure-tolerant: errors become a warning.
 */
export async function prefetchSourceStep(runId: string, source: SourceKind): Promise<{ cards: number }> {
  'use step';
  const key = StepKey.prefetch(source);
  const done = await getCheckpoint<PrefetchCheckpoint>(runId, key);
  if (done) return { cards: done.cards.length };

  const run = await loadActiveRun(runId);
  const started = Date.now();
  const brief = briefOf(run);
  const url = { website: brief.urls.website ?? run.input.websiteUrl, facebook: brief.urls.facebook ?? run.input.facebookUrl, tiktok: brief.urls.tiktok ?? run.input.tiktokUrl }[source];
  const ledger = createAiCtx(runId);
  const out: PrefetchCheckpoint = { cards: [], docs: [], warning: null };

  if (url) {
    await emitProgress(runId, { stage: 'prefetch', status: 'progress', pct: 10, messageTh: `กำลังอ่าน${LABEL_TH[source]}` });
    await demoPause(run);
    try {
      const docs = compactDocs(await fetchDocs(source, url));
      out.docs = docs.map((d): SourceRef => ({ url: d.url, title: d.title, sourceType: d.sourceType, fetchedAt: d.fetchedAt }));
      const state = await guardBudget(runId);
      const limit = state === 'ok' ? docs.length : state === 'soft' ? 2 : 0;
      const cards: EvidenceCard[] = [];
      let failed = 0;
      for (const doc of docs.slice(0, limit)) {
        try {
          cards.push(...(await summarizeSource(doc, ledger.ctx)));
        } catch (err) {
          failed += 1;
          console.warn('[agent] summarizeSource failed', source, errorMessage(err));
        }
      }
      out.cards = cards;
      if (docs.length === 0) out.warning = `ไม่พบข้อมูลที่อ่านได้จาก${LABEL_TH[source]}`;
      else if (failed > 0 && cards.length === 0) out.warning = `สรุปข้อมูลจาก${LABEL_TH[source]}ไม่สำเร็จ จึงวิเคราะห์จากแหล่งอื่นแทน`;
    } catch (err) {
      console.warn('[agent] prefetch failed', source, errorMessage(err));
      out.warning = `ดึงข้อมูลจาก${LABEL_TH[source]}ไม่สำเร็จ จึงวิเคราะห์จากข้อมูลส่วนที่เหลือ`;
    }
  }

  await putCheckpoint(runId, key, out, { costUsd: ledger.spentUsd(), latencyMs: Date.now() - started, model: ledger.model() });
  if (url) {
    await emitProgress(runId, {
      stage: 'prefetch',
      status: 'progress',
      pct: 14,
      messageTh: out.warning ?? `อ่าน${LABEL_TH[source]}แล้ว ${out.docs.length} รายการ`,
    });
  }
  return { cards: out.cards.length };
}

/** Joins the per-source evidence cards (the "summarize" stage) and stores them once for LLM1. */
export async function collectEvidenceStep(runId: string): Promise<{ cards: number }> {
  'use step';
  const done = await getCheckpoint<EvidenceCheckpoint>(runId, StepKey.evidence);
  if (done) return { cards: done.cards };

  await loadActiveRun(runId);
  const normalized = await getCheckpoint<NormalizeCheckpoint>(runId, StepKey.normalize);
  const sources = normalized?.sources ?? [];
  const cards: EvidenceCard[] = [];
  const docs: SourceRef[] = [];
  const warnings: string[] = [];
  for (const source of SOURCE_KINDS) {
    if (!sources.includes(source)) continue;
    const cp = await getCheckpoint<PrefetchCheckpoint>(runId, StepKey.prefetch(source));
    if (!cp) continue;
    cards.push(...cp.cards);
    docs.push(...cp.docs);
    if (cp.warning) warnings.push(cp.warning);
  }

  await store().saveEvidence(runId, cards);
  await addWarnings(runId, warnings);
  const out: EvidenceCheckpoint = { cards: cards.length, docs };
  await putCheckpoint(runId, StepKey.evidence, out);
  await emitProgress(runId, {
    stage: 'prefetch',
    status: sources.length === 0 ? 'skipped' : 'completed',
    pct: 20,
    messageTh: sources.length === 0 ? 'ไม่มีลิงก์ให้ดึงข้อมูล ข้ามไปวิเคราะห์แบรนด์' : `สรุปหลักฐานจากแหล่งข้อมูลได้ ${cards.length} รายการ`,
    partial: warnings.length > 0 ? { warnings } : undefined,
  });
  return { cards: cards.length };
}
