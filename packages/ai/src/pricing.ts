import type { AiCtx, AiUsage } from './types';

type TextPrice = { input: number; cachedInput: number; output: number };

/**
 * USD per 1M tokens. ESTIMATES copied from SYSTEM_DESIGN §0/§15 (2026-10-21) — update when OpenAI changes list prices.
 * Reasoning tokens are billed as output. Unknown model ids fall back to the main-model price (conservative).
 */
export const TEXT_PRICES_USD_PER_1M: Record<string, TextPrice> = {
  'gpt-6.1-sol': { input: 2, cachedInput: 0.1, output: 10 },
  'gpt-6-sol': { input: 2, cachedInput: 0.1, output: 10 },
  // luna price is an assumption (no list price in the design doc yet).
  'gpt-6-luna': { input: 0.4, cachedInput: 0.04, output: 1.6 },
};

/** USD per 1M input tokens (estimates). */
export const EMBEDDING_PRICES_USD_PER_1M: Record<string, number> = {
  'text-embedding-3-large': 0.13,
  'text-embedding-3-small': 0.02,
};

/** USD per audio minute (estimates). */
export const TRANSCRIBE_PRICES_USD_PER_MINUTE: Record<string, number> = {
  'gpt-transcribe': 0.0045,
};

const FALLBACK_TEXT_PRICE: TextPrice = { input: 2, cachedInput: 0.1, output: 10 };

const bareId = (model: string): string => model.replace(/^openai\//, '');

export function estimateTextCostUsd(model: string, u: { inputTokens: number; cachedInputTokens: number; outputTokens: number }): number {
  const p = TEXT_PRICES_USD_PER_1M[bareId(model)] ?? FALLBACK_TEXT_PRICE;
  const cached = Math.min(u.cachedInputTokens, u.inputTokens);
  const usd = ((u.inputTokens - cached) * p.input + cached * p.cachedInput + u.outputTokens * p.output) / 1_000_000;
  return round6(usd);
}

export function estimateEmbeddingCostUsd(model: string, tokens: number): number {
  return round6((tokens * (EMBEDDING_PRICES_USD_PER_1M[bareId(model)] ?? 0.13)) / 1_000_000);
}

export function estimateTranscribeCostUsd(model: string, durationS: number | null): number {
  // Without a duration assume one minute so the budget guard still sees a cost.
  const minutes = durationS != null && durationS > 0 ? durationS / 60 : 1;
  return round6(minutes * (TRANSCRIBE_PRICES_USD_PER_MINUTE[bareId(model)] ?? 0.0045));
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** Calls ctx.onUsage without letting a reporting failure break the model call. */
export async function reportUsage(ctx: AiCtx | undefined, usage: AiUsage): Promise<void> {
  if (!ctx?.onUsage) return;
  try {
    await ctx.onUsage(usage);
  } catch (err) {
    console.warn('[ai] onUsage callback failed', err);
  }
}

/** Normalizes the AI SDK usage object (fields may be undefined) and reports it. */
export async function reportTextUsage(
  ctx: AiCtx | undefined,
  model: string,
  usage: { inputTokens: number | undefined; outputTokens: number | undefined; inputTokenDetails?: { cacheReadTokens: number | undefined } },
): Promise<void> {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  await reportUsage(ctx, { model, inputTokens, outputTokens, costUsd: estimateTextCostUsd(model, { inputTokens, cachedInputTokens, outputTokens }) });
}
