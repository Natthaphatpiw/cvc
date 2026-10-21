// @cvc/ai — LLM stages (LLM0–LLM4), embeddings, transcription and the result chat agent.
// Every function has a deterministic stub that is used when no model is configured (demo mode).

export type { AiCtx, AiUsage, ChatToolsDeps, PlaybookHints, SourceDoc } from './types';
export { AiNotConfiguredError, AiOutputError, demoMode, isAiConfigured, transcribeAvailable, type DemoMode } from './env';
export { models, modelId, embeddingDimensions, type ModelTier, type ReasoningEffort } from './models';
export { EMBEDDING_PRICES_USD_PER_1M, TEXT_PRICES_USD_PER_1M, TRANSCRIBE_PRICES_USD_PER_MINUTE, estimateTextCostUsd } from './pricing';

// LLM0
export { normalizeInput, buildBaseBrief, type NormalizeExtras } from './stages/normalize';
// Quarantined summarizer
export { summarizeSource } from './stages/summarize';
// LLM1
export { researchBrand, type ResearchBrandArgs } from './stages/brand';
// LLM2a
export { planQueries, type QueryPlan } from './stages/plan';
// Injection screen
export { screenInjection, heuristicInjectionScreen, type InjectionScreen } from './stages/injection';
// LLM2b
export { evaluateCreator } from './stages/evaluate';
// LLM4
export {
  curateCreator,
  curatePortfolio,
  fillMetricPlaceholders,
  type CurateCreatorArgs,
  type CuratePortfolioArgs,
} from './stages/curate';

export { embed, cosine } from './embed';
export { transcribe } from './transcribe';
export { spotlight, SPOTLIGHT_RULES } from './prompts/spotlight';

// Chat (§9)
export { createChatAgent, streamChat, CHAT_AGENT_ID, type StreamChatArgs } from './chat/agent';
export { resetChatThread, chatResourceId } from './chat/memory';
export { DEMO_REPLY_PREFIX } from './chat/stub';
