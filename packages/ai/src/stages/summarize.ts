import { EvidenceCard } from '@cvc/schemas';
import { shouldStub } from '../env';
import { LlmEvidenceCard } from '../llm-schemas';
import { buildSummarizeUserContent, SUMMARIZE_INSTRUCTIONS } from '../prompts/summarize';
import { generateStructured } from '../structured';
import { truncate, uniqText } from '../text';
import type { AiCtx, SourceDoc } from '../types';

type Stat = number | string | null;

/** Primitive provider metadata (followers, posts per week …) computed by code; these win over model-read stats. */
export function statsFromMeta(meta: Record<string, unknown>): Record<string, Stat> {
  const out: Record<string, Stat> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || typeof v === 'number' || typeof v === 'string') {
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      out[k] = typeof v === 'string' ? truncate(v, 200) : v;
    }
  }
  return out;
}

function parseStatValue(v: string): Stat {
  const t = v.trim();
  const n = Number(t.replace(/,/g, ''));
  return t !== '' && Number.isFinite(n) ? n : truncate(t, 200);
}

export function stubEvidenceCard(doc: SourceDoc): EvidenceCard {
  const title = doc.title.trim();
  return EvidenceCard.parse({
    source: doc.sourceType,
    sourceUrl: doc.url || null,
    products: [],
    usp: [],
    tone: [],
    priceTier: 'unknown',
    audienceCues: [],
    claims: title ? [{ text: truncate(title, 200), sourceRef: doc.url || doc.sourceType }] : [],
    stats: statsFromMeta(doc.meta),
  });
}

/** Quarantined summarizer (no tools): one SourceDoc → one evidence card. Empty docs yield no card. */
export async function summarizeSource(doc: SourceDoc, ctx?: AiCtx): Promise<EvidenceCard[]> {
  if (!doc.text.trim() && !doc.title.trim()) return [];
  if (shouldStub('summarizeSource')) return [stubEvidenceCard(doc)];

  const sourceId = `S_${doc.sourceType}`;
  const { value } = await generateStructured({
    stage: 'summarize_source',
    tier: 'main',
    effort: 'low',
    instructions: SUMMARIZE_INSTRUCTIONS,
    userContent: buildSummarizeUserContent(doc, sourceId),
    llmSchema: LlmEvidenceCard,
    toDomain: (raw): EvidenceCard => {
      const stats: Record<string, Stat> = {};
      for (const s of raw.stats.slice(0, 20)) {
        const key = s.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40);
        if (key) stats[key] = parseStatValue(s.value);
      }
      return {
        source: doc.sourceType,
        sourceUrl: doc.url || null,
        products: raw.products.slice(0, 20).map((p) => ({
          name: truncate(p.name, 120),
          priceTHB: p.priceTHB != null && Number.isFinite(p.priceTHB) && p.priceTHB >= 0 ? p.priceTHB : null,
          notes: p.notes ? truncate(p.notes, 200) : null,
        })),
        usp: uniqText(raw.usp).slice(0, 10),
        tone: uniqText(raw.tone).slice(0, 6),
        priceTier: raw.priceTier,
        audienceCues: uniqText(raw.audienceCues).slice(0, 10),
        claims: raw.claims.slice(0, 8).map((c) => ({ text: truncate(c.text, 300), sourceRef: c.sourceRef.startsWith(sourceId) ? doc.url + c.sourceRef.slice(sourceId.length) : doc.url })),
        stats: { ...stats, ...statsFromMeta(doc.meta) },
      };
    },
    domainSchema: EvidenceCard,
    maxOutputTokens: 4_000,
    ctx,
  });
  return [value];
}
