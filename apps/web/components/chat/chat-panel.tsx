'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  APICallError,
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  safeValidateUIMessages,
  type UIMessage,
} from 'ai';
import { RotateCcw, Send, Square } from 'lucide-react';
import type { ChatSessionResponse } from '@cvc/schemas';
import { ApiError, agentApi, authHeaders } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorBlock } from '@/components/ui/error-block';
import { Textarea } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageText } from './message-text';

const SUGGESTED_PROMPTS = [
  'เปรียบเทียบอันดับ 1 กับ 2',
  'ถ้าเน้นยอดขายมากขึ้น อันดับจะเปลี่ยนไหม',
  'ควรบรีฟครีเอเตอร์อันดับ 1 อย่างไร',
] as const;

const TOOL_LABEL: Record<string, string> = {
  get_kol_dossier: 'ข้อมูลครีเอเตอร์ในผลวิเคราะห์',
  compare_kols: 'การเปรียบเทียบครีเอเตอร์',
  simulate_weights: 'การจำลองน้ำหนักคะแนน',
  search_result_evidence: 'หลักฐานในผลวิเคราะห์',
  research_kol: 'การค้นข้อมูลเพิ่มเติม',
  evaluate_kol: 'การประเมินครีเอเตอร์เพิ่ม',
};

type Part = UIMessage['parts'][number];

function chatErrorTh(error: Error): string {
  if (APICallError.isInstance(error)) {
    if (error.responseBody) {
      try {
        const body: unknown = JSON.parse(error.responseBody);
        if (body && typeof body === 'object' && 'error' in body) {
          const inner: unknown = body.error;
          if (inner && typeof inner === 'object' && 'messageTh' in inner && typeof inner.messageTh === 'string') {
            return inner.messageTh;
          }
        }
      } catch {
        // not JSON: fall through to the status-based message
      }
    }
    if (error.statusCode === 429) return 'ถามติดต่อกันเร็วเกินไป รอสักครู่แล้วลองอีกครั้ง';
    if (error.statusCode === 404) return 'ไม่พบผลวิเคราะห์นี้ หรือผลวิเคราะห์หมดอายุแล้ว';
  }
  return 'ส่งคำถามไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง';
}

function ToolLine({ part }: { part: Part }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const label = TOOL_LABEL[name] ?? name;
  const suffix =
    part.state === 'output-error'
      ? ' (ดึงข้อมูลไม่สำเร็จ)'
      : part.state === 'output-available'
        ? ''
        : part.state === 'output-denied'
          ? ' (ไม่ได้ใช้)'
          : ' (กำลังดึงข้อมูล)';
  return (
    <p className="text-meta font-light text-muted">
      ใช้ข้อมูล: {label}
      {suffix}
    </p>
  );
}

function MessageView({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';
  const sources = message.parts.filter((p): p is Extract<Part, { type: 'source-url' }> => p.type === 'source-url');
  const grounding = message.parts.some((p) => p.type === 'data-grounding-warning');

  if (isUser) {
    const text = message.parts
      .map((p) => (p.type === 'text' ? p.text : ''))
      .join('')
      .trim();
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-card bg-accent-soft px-3 py-2 text-body font-light whitespace-pre-wrap text-accent-ink">
          <span className="sr-only">คุณ: </span>
          {text}
        </div>
      </li>
    );
  }

  return (
    <li className="flex justify-start">
      <div className="flex max-w-[92%] flex-col gap-1.5 rounded-card border border-border bg-surface px-3 py-2 text-body font-light text-text">
        <span className="sr-only">ผู้ช่วย: </span>
        {message.parts.map((part, i) => {
          if (part.type === 'text') return part.text ? <MessageText key={i} text={part.text} /> : null;
          if (isToolUIPart(part)) return <ToolLine key={i} part={part} />;
          return null;
        })}
        {sources.length > 0 ? (
          <div className="border-t border-rule pt-1.5 text-meta font-light text-muted">
            <p>แหล่งที่มา</p>
            <ol className="list-decimal pl-4">
              {sources.map((s) => (
                <li key={s.sourceId}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2">
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {grounding ? (
          <p className="rounded-control bg-warning-soft px-2 py-1 text-meta font-light text-warning">
            ตัวเลขบางส่วนในคำตอบอาจไม่ตรงกับข้อมูลในผลวิเคราะห์ ตรวจสอบก่อนนำไปใช้
          </p>
        ) : null}
      </div>
    </li>
  );
}

function ChatThread({
  resultId,
  sessionId,
  initialMessages,
  onTurnFinished,
}: {
  resultId: string;
  sessionId: string;
  initialMessages: UIMessage[];
  onTurnFinished: (opts: { resultChanged: boolean }) => void;
}) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `/api/agent/chat/${encodeURIComponent(resultId)}`,
        headers: () => authHeaders(),
        // The server keeps the history (SYSTEM_DESIGN §9.2): send only the newest message.
        prepareSendMessagesRequest: ({ id, messages }) => {
          const last = messages.at(-1);
          return { body: { id, message: last, messages: last ? [last] : [] } };
        },
      }),
    [resultId],
  );

  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat<UIMessage>({
    id: `result-${resultId}-${sessionId}`,
    messages: initialMessages,
    transport,
    onFinish: ({ message, isAbort, isError }) => {
      const resultChanged =
        !isAbort &&
        !isError &&
        message.parts.some((p) => isToolUIPart(p) && getToolName(p) === 'evaluate_kol' && p.state === 'output-available');
      onTurnFinished({ resultChanged });
    },
  });

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (error) clearError();
    void sendMessage({ text: trimmed });
    setInput('');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="บทสนทนา"
        className="min-h-[240px] flex-1 overflow-y-auto py-3"
      >
        <ol className="flex flex-col gap-3">
          {messages.length === 0 ? (
            <li className="flex flex-col gap-2">
              <p className="text-label font-light text-muted">
                ถามเกี่ยวกับครีเอเตอร์ อันดับ หรือแผนงานในผลวิเคราะห์นี้ เช่น
              </p>
              <ul className="flex flex-col items-start gap-1">
                {SUGGESTED_PROMPTS.map((p) => (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => submit(p)}
                      className="cursor-pointer rounded-chip text-left text-body font-light text-accent transition-colors duration-150 hover:text-accent-hover hover:underline"
                    >
                      {p}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ) : (
            messages.filter((m) => m.role !== 'system').map((m) => <MessageView key={m.id} message={m} />)
          )}
          {status === 'submitted' ? (
            <li className="text-label font-light text-muted">กำลังเตรียมคำตอบ</li>
          ) : null}
        </ol>
      </div>

      {error ? (
        <div role="alert" className="mb-2 flex items-center justify-between gap-3 rounded-control bg-negative-soft px-3 py-2">
          <p className="text-label font-light text-negative">{chatErrorTh(error)}</p>
          <Button variant="tertiary" size="sm" onClick={() => void regenerate()}>
            ลองอีกครั้ง
          </Button>
        </div>
      ) : null}

      <form
        className="flex items-end gap-2 border-t border-rule pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label htmlFor={`chat-input-${sessionId}`} className="sr-only">
          พิมพ์คำถาม
        </label>
        <Textarea
          id={`chat-input-${sessionId}`}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder="เช่น ใครเหมาะกับการไลฟ์ขายมากที่สุด"
          className="min-h-16! flex-1 resize-none!"
          maxLength={2000}
        />
        {busy ? (
          <Button type="button" variant="secondary" onClick={() => void stop()} aria-label="หยุดตอบ">
            <Square aria-hidden="true" size={14} strokeWidth={1.5} />
            หยุด
          </Button>
        ) : (
          <Button type="submit" variant="secondary" disabled={input.trim().length === 0} aria-label="ส่งคำถาม">
            <Send aria-hidden="true" size={16} strokeWidth={1.5} />
            ส่ง
          </Button>
        )}
      </form>
      <p className="mt-1.5 text-meta font-light text-muted">
        Enter เพื่อส่ง · Shift+Enter ขึ้นบรรทัดใหม่
      </p>
    </div>
  );
}

type SessionState =
  | { kind: 'loading' }
  | { kind: 'error'; messageTh: string }
  | { kind: 'ready'; session: ChatSessionResponse; messages: UIMessage[] };

async function toUIMessages(raw: unknown[]): Promise<UIMessage[]> {
  if (raw.length === 0) return [];
  const parsed = await safeValidateUIMessages<UIMessage>({ messages: raw });
  return parsed.success ? parsed.data : [];
}

/** Rail tab "ถาม-ตอบ": one chat per result, memory only within the active session (SYSTEM_DESIGN §9.1). */
export function ChatPanel({
  resultId,
  disabledReason,
  onResultChanged,
}: {
  resultId: string;
  /** When set, the chat is not available (e.g. offline copy) and this sentence explains why. */
  disabledReason?: string | null;
  onResultChanged?: () => void;
}) {
  const [state, setState] = useState<SessionState>({ kind: 'loading' });
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const session = await agentApi.chatSession(resultId);
      const messages = await toUIMessages(session.messages);
      setState({ kind: 'ready', session, messages });
    } catch (e) {
      setState({ kind: 'error', messageTh: e instanceof ApiError ? e.messageTh : 'โหลดแชทไม่สำเร็จ' });
    }
  }, [resultId]);

  useEffect(() => {
    if (disabledReason) return;
    void load();
  }, [load, disabledReason]);

  const onTurnFinished = useCallback(
    ({ resultChanged }: { resultChanged: boolean }) => {
      if (resultChanged) onResultChanged?.();
      // Refresh the research quota without touching the live message list.
      agentApi
        .chatSession(resultId)
        .then((s) =>
          setState((prev) =>
            prev.kind === 'ready' && prev.session.sessionId === s.sessionId
              ? { ...prev, session: { ...prev.session, researchCallsLeft: s.researchCallsLeft } }
              : prev,
          ),
        )
        .catch(() => undefined);
    },
    [onResultChanged, resultId],
  );

  async function reset() {
    setResetting(true);
    setResetError(null);
    try {
      const session = await agentApi.resetChat(resultId);
      setState({ kind: 'ready', session, messages: [] });
      setConfirmReset(false);
    } catch (e) {
      setResetError(e instanceof ApiError ? e.messageTh : 'เริ่มแชทใหม่ไม่สำเร็จ ลองอีกครั้ง');
    } finally {
      setResetting(false);
    }
  }

  if (disabledReason) {
    return (
      <div className="rounded-card border border-dashed border-control px-4 py-6 text-center text-label font-light text-muted">
        {disabledReason}
      </div>
    );
  }

  return (
    <div className="flex h-[600px] max-h-[80dvh] flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-rule pb-3">
        <div className="min-w-0">
          <h3 className="text-body font-medium text-text">ถามเกี่ยวกับผลวิเคราะห์นี้</h3>
          <p className="text-meta font-light text-muted">
            {state.kind === 'ready' ? `แชทรอบที่ ${state.session.sessionNo} · ` : ''}จำบทสนทนาเฉพาะในรอบนี้เท่านั้น
          </p>
        </div>
        {state.kind === 'ready' && !confirmReset ? (
          <Button variant="tertiary" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw aria-hidden="true" size={14} strokeWidth={1.5} />
            เริ่มแชทใหม่
          </Button>
        ) : null}
      </div>

      {confirmReset ? (
        <div role="alertdialog" aria-label="ยืนยันการเริ่มแชทใหม่" className="mt-3 rounded-control border border-border bg-raised px-3 py-2.5">
          <p className="text-label font-light text-text">
            เริ่มแชทใหม่หรือไม่ บทสนทนาเดิมจะถูกลบ และแชทใหม่จะไม่จำสิ่งที่คุยไว้ ผลวิเคราะห์ยังอยู่เหมือนเดิม
          </p>
          {resetError ? <p className="mt-1 text-label font-light text-negative">{resetError}</p> : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmReset(false)} disabled={resetting}>
              ยกเลิก
            </Button>
            <Button variant="danger" size="sm" onClick={() => void reset()} loading={resetting}>
              เริ่มแชทใหม่
            </Button>
          </div>
        </div>
      ) : null}

      {state.kind === 'loading' ? (
        <div aria-hidden="true" className="flex flex-1 flex-col gap-3 py-3">
          <Skeleton className="h-14 w-4/5" />
          <Skeleton className="ml-auto h-10 w-3/5" />
          <Skeleton className="h-20 w-4/5" />
          <div className="mt-auto">
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="py-3">
          <ErrorBlock messageTh={state.messageTh} onRetry={() => void load()} />
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <>
          <ChatThread
            key={state.session.sessionId}
            resultId={resultId}
            sessionId={state.session.sessionId}
            initialMessages={state.messages}
            onTurnFinished={onTurnFinished}
          />
          <p className="mt-1 text-meta font-light text-muted">
            ค้นข้อมูลภายนอกเพิ่มได้อีก {state.session.researchCallsLeft} ครั้งในแชทรอบนี้ · คำตอบจาก AI เป็นคำแนะนำ
            ตรวจสอบก่อนติดต่อครีเอเตอร์
          </p>
        </>
      ) : null}
    </div>
  );
}
