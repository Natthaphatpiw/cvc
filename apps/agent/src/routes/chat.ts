import { resetChatThread, streamChat, type ChatToolsDeps } from '@cvc/ai';
import { requireEdge, requireUser } from '@cvc/auth';
import { getAgentStore, type CandidateRow, type ChatSessionRecord } from '@cvc/db';
import type { ChatSessionResponse, FinalResult } from '@cvc/schemas';
import { safeValidateUIMessages } from 'ai';
import { Hono } from 'hono';
import { ApiFailure, currentUser, enforceRateLimit, loadOwnedResult, readJson, type AppEnv } from '../http';
import { errorMessage } from '../lib/async';
import { normalizeWeights, rescoreResult } from '../lib/rescore';

/** research_kol budget per chat session (MVP §17.5). */
const RESEARCH_CALLS_PER_SESSION = 3;
/** Upper bound for one user turn (the web input allows 2,000 characters). */
const MAX_MESSAGE_CHARS = 4000;

async function activeSession(resultId: string, ownerId: string): Promise<ChatSessionRecord> {
  const store = getAgentStore();
  return (await store.getChatSession(resultId, ownerId)) ?? (await store.createChatSession(resultId, ownerId));
}

function sessionBody(session: ChatSessionRecord): ChatSessionResponse {
  return {
    sessionId: session.id,
    sessionNo: session.sessionNo,
    researchCallsLeft: Math.max(0, RESEARCH_CALLS_PER_SESSION - session.researchCallsUsed),
    // Server-side memory listing is not part of the @cvc/ai contract yet; the client keeps the visible transcript.
    messages: [],
  };
}

/** The client sends only the new message (§9.2); history comes from server-side memory. */
function incomingMessages(body: unknown): unknown[] {
  if (body === null || typeof body !== 'object') return [];
  if ('message' in body && body.message !== undefined) return [body.message];
  if ('messages' in body && Array.isArray(body.messages)) {
    const last: unknown = body.messages.at(-1);
    return last === undefined ? [] : [last];
  }
  return [];
}

function chatDeps(a: { result: FinalResult; sessionId: string; researchCallsUsed: number }): ChatToolsDeps {
  const store = getAgentStore();
  let used = a.researchCallsUsed;
  let candidates: CandidateRow[] | null = null;
  const getResult = async (): Promise<FinalResult> => (await store.getResult(a.result.resultId))?.result ?? a.result;
  return {
    getResult,
    getDossier: async (creatorId) => {
      candidates ??= await store.listCandidates(a.result.runId);
      return candidates.find((r) => r.creatorId === creatorId)?.dossier ?? null;
    },
    rescore: async (weights) => {
      const current = await getResult();
      return rescoreResult({ result: current, weights: normalizeWeights(weights), preset: current.methodology.preset });
    },
    researchCallsLeft: async () => Math.max(0, RESEARCH_CALLS_PER_SESSION - used),
    useResearchCall: async () => {
      used = await store.incrementResearchCalls(a.sessionId);
    },
  };
}

export function chatRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const edge = requireEdge();
  const user = requireUser({ allowAnonymous: true });

  r.post('/chat/:resultId', edge, user, async (c) => {
    const me = currentUser(c);
    await enforceRateLimit(`rl:chat:${me.id}`, 20, 60);
    const result = await loadOwnedResult(c.req.param('resultId'), me);

    const validated = await safeValidateUIMessages({ messages: incomingMessages(await readJson(c)) });
    const message = validated.success ? validated.data.at(-1) : undefined;
    // Only text reaches the agent: file parts would make the model layer fetch arbitrary URLs server-side.
    const texts = message?.role === 'user' ? message.parts.flatMap((p) => (p.type === 'text' ? [p.text] : [])) : [];
    if (!message || texts.every((t) => t.trim().length === 0)) {
      throw new ApiFailure(400, 'invalid_message', 'รูปแบบข้อความแชทไม่ถูกต้อง กรุณาส่งใหม่อีกครั้ง');
    }
    if (texts.reduce((n, t) => n + t.length, 0) > MAX_MESSAGE_CHARS) {
      throw new ApiFailure(400, 'message_too_long', `ข้อความยาวเกินไป กรุณาส่งไม่เกิน ${MAX_MESSAGE_CHARS.toLocaleString('en-US')} ตัวอักษร`);
    }

    const session = await activeSession(result.resultId, me.id);
    return streamChat({
      resultId: result.resultId,
      sessionId: session.id,
      threadId: session.threadId,
      ownerId: me.id,
      messages: [{ id: message.id, role: 'user', parts: texts.map((text) => ({ type: 'text' as const, text })) }],
      deps: chatDeps({ result, sessionId: session.id, researchCallsUsed: session.researchCallsUsed }),
    });
  });

  r.get('/chat/:resultId/session', edge, user, async (c) => {
    const me = currentUser(c);
    const result = await loadOwnedResult(c.req.param('resultId'), me);
    c.header('cache-control', 'no-store');
    return c.json(sessionBody(await activeSession(result.resultId, me.id)));
  });

  r.post('/chat/:resultId/reset', edge, user, async (c) => {
    const me = currentUser(c);
    const result = await loadOwnedResult(c.req.param('resultId'), me);
    const store = getAgentStore();
    const previous = await store.getChatSession(result.resultId, me.id);
    const next = await store.createChatSession(result.resultId, me.id);
    if (previous) {
      try {
        await resetChatThread(previous.threadId);
      } catch (err) {
        console.warn('[agent] resetChatThread failed', errorMessage(err));
      }
    }
    return c.json(sessionBody(next));
  });

  return r;
}
