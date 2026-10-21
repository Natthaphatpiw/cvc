import type { CreatorDossier, FinalResult, GroupWeights } from '@cvc/schemas';
import type { UIMessage } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildChatAgent, streamAgentTurn } from './chat/agent';
import { chatResourceId, getChatMemory } from './chat/memory';
import { buildStubAnswer, DEMO_REPLY_PREFIX } from './chat/stub';
import { buildChatTools } from './chat/tools';
import { renderResultDigest } from './prompts/chat';
import { resetChatThread, streamChat } from './index';
import { dossier, finalResult, setStubEnv } from './test/fixtures';
import type { ChatToolsDeps } from './types';

beforeEach(() => setStubEnv());

function deps(overrides: Partial<ChatToolsDeps> = {}): ChatToolsDeps & { researchUsed: number } {
  const result = finalResult();
  const state = { researchUsed: 0 };
  return Object.assign(state, {
    getResult: async (): Promise<FinalResult> => result,
    getDossier: async (id: string): Promise<CreatorDossier | null> => (id === 'creator-0001' ? dossier() : null),
    rescore: async (w: GroupWeights): Promise<FinalResult> => ({
      ...result,
      methodology: { ...result.methodology, weights: w },
      recommendations: [...result.recommendations].reverse().map((r, i) => ({ ...r, rank: i + 1 })),
    }),
    researchCallsLeft: async () => 1 - state.researchUsed,
    useResearchCall: async () => {
      state.researchUsed += 1;
    },
    ...overrides,
  });
}

const userMessage = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] });

/** Chunks of a UI message stream SSE body. */
async function sseChunks(res: Response): Promise<{ type: string; delta?: string }[]> {
  const body = await res.text();
  return body
    .split('\n')
    .filter((l) => l.startsWith('data: ') && l !== 'data: [DONE]')
    .map((l) => JSON.parse(l.slice(6)) as { type: string; delta?: string });
}

const textOf = (chunks: { type: string; delta?: string }[]): string =>
  chunks
    .filter((c) => c.type === 'text-delta')
    .map((c) => c.delta ?? '')
    .join('');

async function streamedText(res: Response): Promise<string> {
  return textOf(await sseChunks(res));
}

describe('streamChat stub (no OpenAI key)', () => {
  it('answers from the result numbers and says it is a demo reply first', async () => {
    const res = await streamChat({ resultId: 'res-0001', sessionId: 's1', threadId: 'res_res-0001_s1', ownerId: 'u1', messages: [userMessage('m1', 'เทียบ @creator_a กับ @creator_c')], deps: deps() });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await streamedText(res);
    expect(text.startsWith(DEMO_REPLY_PREFIX)).toBe(true);
    expect(text).toContain('@creator_a');
    expect(text).toContain('@creator_c');
    expect(text).not.toContain('@creator_b:');
    expect(text).toContain('51,000');
    expect(text).toContain('ค่าประมาณ');
  });

  it('compares the top two when no creator is named', () => {
    const text = buildStubAnswer(finalResult(), 'ควรเลือกใคร');
    expect(text).toContain('@creator_a');
    expect(text).toContain('@creator_b');
    expect(text).toContain('@creator_b มียอดวิวคาดการณ์สูงกว่า');
    expect(text).toContain('@creator_a มีต้นทุนต่อวิวต่ำกว่า');
  });
});

describe('chat tools', () => {
  it('compare_kols computes rows and leaders in code', async () => {
    const tools = buildChatTools(deps());
    const out = (await tools.compare_kols.execute?.({ handles: ['@creator_a', 'creator_b', 'ghost'] }, {} as never)) as {
      rows: { handle: string }[];
      leaders: Record<string, string | null>;
      notFound: string[];
    };
    expect(out.rows.map((r) => r.handle)).toEqual(['creator_a', 'creator_b']);
    expect(out.leaders.total).toBe('creator_a');
    expect(out.leaders.expected_views).toBe('creator_b');
    expect(out.leaders.cpv).toBe('creator_a');
    expect(out.notFound).toEqual(['ghost']);
  });

  it('simulate_weights normalizes weights and reports previous ranks', async () => {
    const tools = buildChatTools(deps());
    const out = (await tools.simulate_weights.execute?.({ emphasize: 'cost' }, {} as never)) as { weightsUsed: GroupWeights; ranking: { rank: number; handle: string; previousRank: number | null }[] };
    const sum = Object.values(out.weightsUsed).reduce((s, x) => s + x, 0);
    expect(sum).toBeCloseTo(1, 2);
    expect(out.weightsUsed.cost).toBeCloseTo(0.182, 3);
    expect(out.ranking[0]).toEqual({ rank: 1, handle: 'creator_c', total: 79, previousRank: 3 });
  });

  it('research_kol consumes the session budget only on success', async () => {
    const d = deps();
    const tools = buildChatTools(d);
    const missing = (await tools.research_kol.execute?.({ handle: 'nobody', question: 'คอมเมนต์เป็นยังไง' }, {} as never)) as { ok: boolean };
    expect(missing.ok).toBe(false);
    expect(d.researchUsed).toBe(0);
    const ok = (await tools.research_kol.execute?.({ handle: 'creator_a', question: 'คอมเมนต์เป็นยังไง' }, {} as never)) as { ok: boolean; sponsoredVsOrganic: { sponsoredCount: number } };
    expect(ok.ok).toBe(true);
    expect(ok.sponsoredVsOrganic.sponsoredCount).toBe(3);
    expect(d.researchUsed).toBe(1);
    const limited = (await tools.research_kol.execute?.({ handle: 'creator_a', question: 'อีกครั้ง' }, {} as never)) as { ok: boolean; messageTh: string };
    expect(limited.ok).toBe(false);
    expect(limited.messageTh).toContain('ครบแล้ว');
  });

  it('digest lists every recommendation with estimates labelled', () => {
    const digest = renderResultDigest(finalResult());
    expect(digest).toContain('#1 @creator_a');
    expect(digest).toContain('#3 @creator_c');
    expect(digest).toContain('(estimate, confidence medium)');
  });
});

describe('Mastra agent turn (mock model, in-memory storage)', () => {
  it('streams a UI message response and keeps the thread in memory until reset', async () => {
    const stream = (text: string) => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
        { type: 'text-start' as const, id: 't1' },
        { type: 'text-delta' as const, id: 't1', delta: text },
        { type: 'text-end' as const, id: 't1' },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: 'completed' },
          usage: { inputTokens: { total: 500, noCache: 500, cacheRead: 0, cacheWrite: undefined }, outputTokens: { total: 50, text: 50, reasoning: 0 } },
        },
      ]),
    });
    const model = new MockLanguageModelV4({ doStream: [stream('คำตอบแรก'), stream('คำตอบที่สอง')] });
    const d = deps();
    const agent = buildChatAgent(d, model);
    const onUsage = vi.fn();
    const base = { resultId: 'res-0001', sessionId: 's1', threadId: 'res_res-0001_s1', ownerId: 'u1', deps: d, ctx: { onUsage } };

    const res1 = await streamAgentTurn(agent, { ...base, messages: [userMessage('m1', 'ใครเหมาะที่สุด')] }, 'gpt-6.1-sol');
    const chunks1 = await sseChunks(res1);
    expect(textOf(chunks1)).toBe('คำตอบแรก');
    expect(chunks1[0]?.type).toBe('start');
    expect(chunks1.at(-1)?.type).toBe('finish');
    const res2 = await streamAgentTurn(agent, { ...base, messages: [userMessage('m2', 'แล้วอันดับสองล่ะ')] }, 'gpt-6.1-sol');
    expect(await streamedText(res2)).toBe('คำตอบที่สอง');

    const firstCall = model.doStreamCalls[0];
    expect(JSON.stringify(firstCall?.prompt)).toContain('RESULT DIGEST');
    expect(firstCall?.providerOptions?.openai).toMatchObject({ reasoningEffort: 'low', store: false });
    expect((firstCall?.tools ?? []).map((t) => t.name).sort()).toEqual(['compare_kols', 'get_kol_dossier', 'research_kol', 'simulate_weights']);
    // History comes from memory: the second call sees the first turn.
    const secondPrompt = JSON.stringify(model.doStreamCalls[1]?.prompt);
    expect(secondPrompt).toContain('ใครเหมาะที่สุด');
    expect(secondPrompt).toContain('คำตอบแรก');
    expect(onUsage).toHaveBeenCalled();

    const memory = await getChatMemory();
    const thread = await memory.getThreadById({ threadId: base.threadId });
    expect(thread?.resourceId).toBe(chatResourceId('res-0001'));
    await resetChatThread(base.threadId);
    expect(await memory.getThreadById({ threadId: base.threadId })).toBeNull();
    await expect(resetChatThread('does-not-exist')).resolves.toBeUndefined();
  });
});
