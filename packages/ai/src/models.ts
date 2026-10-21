import { createGateway } from '@ai-sdk/gateway';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { hasOpenAiKey, useAiGateway } from './env';

export type ModelTier = 'main' | 'fast';
export type ReasoningEffort = 'low' | 'medium' | 'high';

type OpenAiProvider = ReturnType<typeof createOpenAI>;
export type LanguageModelInstance = ReturnType<OpenAiProvider['responses']>;
export type EmbeddingModelInstance = ReturnType<OpenAiProvider['embedding']>;
export type TranscriptionModelInstance = ReturnType<OpenAiProvider['transcription']>;

const envOr = (name: string, fallback: string): string => process.env[name]?.trim() || fallback;

export function modelId(tier: ModelTier): string {
  return tier === 'main' ? envOr('OPENAI_MODEL_MAIN', 'gpt-6.1-sol') : envOr('OPENAI_MODEL_FAST', 'gpt-6-luna');
}

export function embeddingModelId(): string {
  return envOr('OPENAI_EMBEDDING_MODEL', 'text-embedding-3-large');
}

export function transcribeModelId(): string {
  return envOr('OPENAI_TRANSCRIBE_MODEL', 'gpt-transcribe');
}

export function embeddingDimensions(): number {
  const n = Number.parseInt(process.env.OPENAI_EMBEDDING_DIMENSIONS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 1536;
}

function openaiProvider(): OpenAiProvider {
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY?.trim() || undefined });
}

function gatewayProvider(): ReturnType<typeof createGateway> {
  return createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY?.trim() || undefined });
}

/** Responses-API model (or `openai/<id>` through AI Gateway when USE_AI_GATEWAY=true). */
export function languageModel(tier: ModelTier): { id: string; model: LanguageModelInstance } {
  const id = modelId(tier);
  return { id, model: useAiGateway() ? gatewayProvider()(`openai/${id}`) : openaiProvider().responses(id) };
}

export function embeddingModel(): { id: string; model: EmbeddingModelInstance } {
  const id = embeddingModelId();
  return { id, model: useAiGateway() ? gatewayProvider().embeddingModel(`openai/${id}`) : openaiProvider().embedding(id) };
}

/** Transcription prefers a direct OpenAI key (BYOK/ASR); the gateway is the fallback. */
export function transcriptionModel(): { id: string; model: TranscriptionModelInstance } {
  const id = transcribeModelId();
  if (hasOpenAiKey() || !useAiGateway()) return { id, model: openaiProvider().transcription(id) };
  return { id, model: gatewayProvider().transcription(`openai/${id}`) };
}

/** Whether the current text model accepts OpenAI provider-executed tools (web_search). */
export function supportsOpenAiTools(): boolean {
  return !useAiGateway();
}

export const models: {
  main(): LanguageModel;
  fast(): LanguageModel;
  readonly embeddingId: string;
  readonly transcribeId: string;
} = {
  main: () => languageModel('main').model,
  fast: () => languageModel('fast').model,
  get embeddingId() {
    return embeddingModelId();
  },
  get transcribeId() {
    return transcribeModelId();
  },
};
