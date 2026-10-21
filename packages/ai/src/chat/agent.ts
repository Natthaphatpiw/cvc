import { PROMPT_VERSION } from '@cvc/schemas';
import { toAISdkStream } from '@mastra/ai-sdk';
import { Agent } from '@mastra/core/agent';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage, type UIMessageChunk } from 'ai';
import { shouldStub } from '../env';
import { languageModel, type LanguageModelInstance } from '../models';
import { reportTextUsage } from '../pricing';
import { buildChatInstructions } from '../prompts/chat';
import type { AiCtx, ChatToolsDeps } from '../types';
import { chatResourceId, getChatMemory } from './memory';
import { stubChatResponse } from './stub';
import { buildChatTools } from './tools';

export const CHAT_AGENT_ID = 'result-chat';
/** Tool-loop bound per turn (compare + simulate + research + answer fits comfortably). */
const CHAT_MAX_STEPS = 8;
const CHAT_ERROR_TH = 'ขออภัย ผู้ช่วยตอบไม่สำเร็จในตอนนี้ ลองส่งคำถามอีกครั้ง';

/** Agent factory with an injectable model (tests use a mock model). */
export function buildChatAgent(deps: ChatToolsDeps, model: LanguageModelInstance): Agent {
  return new Agent({
    id: CHAT_AGENT_ID,
    name: 'KOL Result Assistant',
    description: 'Answers planner questions about one KOL matching result, in Thai, grounded in the result and tool outputs.',
    // Static rules first, then the pinned result digest (stable per result → prompt-cache friendly).
    instructions: async () => buildChatInstructions(await deps.getResult()),
    model,
    tools: buildChatTools(deps),
    memory: () => getChatMemory(),
  });
}

/** Mastra agent for result chat (§9): main model, low reasoning effort, memory per session thread, four tools. */
export function createChatAgent(deps: ChatToolsDeps): Agent {
  return buildChatAgent(deps, languageModel('main').model);
}

export type StreamChatArgs = {
  resultId: string;
  sessionId: string;
  threadId: string;
  ownerId: string;
  messages: UIMessage[];
  deps: ChatToolsDeps;
  /** Optional usage/cost reporting and cancellation (extension of the contract). */
  ctx?: AiCtx;
};

/** Runs one chat turn on an agent and returns an AI SDK 7 UI message stream response. */
export async function streamAgentTurn(agent: Agent, a: StreamChatArgs, modelIdForCost: string): Promise<Response> {
  // The client sends only the new message (§9.2); history comes from memory, so only the last user message is used.
  const last = [...a.messages].reverse().find((m) => m.role === 'user');
  if (!last) throw new Error('streamChat: no user message');

  const output = await agent.stream([last], {
    memory: { thread: a.threadId, resource: chatResourceId(a.resultId) },
    maxSteps: CHAT_MAX_STEPS,
    abortSignal: a.ctx?.signal,
    providerOptions: { openai: { reasoningEffort: 'low', store: false, promptCacheKey: `chat-${PROMPT_VERSION}` } },
    onFinish: async (event) => {
      await reportTextUsage(a.ctx, modelIdForCost, {
        inputTokens: event.totalUsage.inputTokens,
        outputTokens: event.totalUsage.outputTokens,
        inputTokenDetails: { cacheReadTokens: event.totalUsage.cachedInputTokens },
      });
    },
  });

  const stream = createUIMessageStream({
    originalMessages: a.messages,
    onError: () => CHAT_ERROR_TH,
    execute: ({ writer }) => {
      // @mastra/ai-sdk bundles its own copy of the AI SDK 7 chunk types; the runtime shape is the same.
      const chunks = toAISdkStream(output, { from: 'agent', version: 'v7', onError: () => CHAT_ERROR_TH }) as unknown as ReadableStream<UIMessageChunk>;
      writer.merge(chunks);
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/**
 * Result chat turn. Real Mastra agent when a model is configured; otherwise a deterministic demo answer built from
 * the result numbers (first sentence says it is a demo reply).
 */
export async function streamChat(a: StreamChatArgs): Promise<Response> {
  if (shouldStub('streamChat')) return stubChatResponse(await a.deps.getResult(), a.messages);
  const { id, model } = languageModel('main');
  return streamAgentTurn(buildChatAgent(a.deps, model), a, id);
}
