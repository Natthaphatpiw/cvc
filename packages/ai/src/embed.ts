import { embedMany } from 'ai';
import { shouldStub } from './env';
import { embeddingDimensions, embeddingModel } from './models';
import { estimateEmbeddingCostUsd, reportUsage } from './pricing';
import { segmentWords } from './text';
import type { AiCtx } from './types';

/** FNV-1a 32-bit hash. */
function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic hashed bag-of-words vector (Thai-aware word segmentation, signed feature hashing, L2-normalized).
 * Cosine between two such vectors approximates word overlap, which keeps demo-mode ranking meaningful.
 */
export function hashedEmbedding(text: string, dims: number): number[] {
  const v = new Array<number>(dims).fill(0);
  const tokens = segmentWords(text);
  for (const tok of tokens) {
    const h = fnv1a(tok);
    const idx = h % dims;
    const sign = (fnv1a(tok, 0x9747b28c) & 1) === 0 ? 1 : -1;
    v[idx] = (v[idx] ?? 0) + sign;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

/** Embeddings for `texts` (dims from OPENAI_EMBEDDING_DIMENSIONS, default 1536). */
export async function embed(texts: string[], ctx?: AiCtx): Promise<number[][]> {
  if (texts.length === 0) return [];
  const dims = embeddingDimensions();
  if (shouldStub('embed')) return texts.map((t) => hashedEmbedding(t, dims));

  // The API rejects empty strings; embed a single space instead so positions stay aligned.
  const values = texts.map((t) => (t.trim() ? t.normalize('NFC') : ' '));
  const { id, model } = embeddingModel();
  const result = await embedMany({ model, values, dimensions: dims, maxRetries: 1, abortSignal: ctx?.signal });
  await reportUsage(ctx, { model: id, inputTokens: result.usage.tokens, outputTokens: 0, costUsd: estimateEmbeddingCostUsd(id, result.usage.tokens) });
  return result.embeddings.map((e) => Array.from(e));
}

/** Cosine similarity; 0 when either vector is zero or the dimensions differ. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
