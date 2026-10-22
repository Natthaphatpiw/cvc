'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { LoaderCircle, Undo2 } from 'lucide-react';
import type { AssistResponse, AssistSection } from '@cvc/schemas';
import { agentApi, errorMessageTh } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AiSparkleIcon } from '@/components/ui/ai-sparkle';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

/** AssistRequest.promptTh limits (packages/schemas/src/api.ts). */
export const ASSIST_PROMPT_MIN = 2;
export const ASSIST_PROMPT_MAX = 500;

/** Company name and links from the brand section, sent with the request as context (null when empty or invalid). */
export type AssistContext = { companyName: string | null; websiteUrl: string | null; facebookUrl: string | null };

/** What one fill did: the model's one-line note, and how to put the section's previous values back. */
export type AssistFill = { noteTh: string; undo: () => void };

export type AssistResponseFor<S extends AssistSection> = Extract<AssistResponse, { section: S }>;

export type AiAssistBarProps<S extends AssistSection> = {
  section: S;
  context: AssistContext;
  /** Visible label of the prompt input. */
  label: string;
  placeholder: string;
  /** Accessible name and tooltip of the round sparkle button, e.g. "ให้ AI ช่วยกรอกกลุ่มลูกค้า". */
  buttonLabel: string;
  /** Shown under the bar until the first result: what the fill will change. */
  hint?: string;
  /**
   * Writes the suggestion into the section and returns how to restore it. Called with the latest render's callback,
   * so the values it snapshots for undo are the ones on screen when the answer arrived.
   */
  onFill: (res: AssistResponseFor<S>) => AssistFill;
  className?: string;
};

const TOO_SHORT_TH = `พิมพ์ความต้องการสั้นๆ ก่อน อย่างน้อย ${ASSIST_PROMPT_MIN} ตัวอักษร`;

/**
 * Prompt bar that asks POST /api/agent/assist to fill one form section. It sits inside the analysis <form>, so Enter
 * runs the assist and never submits the form. Only an explicit click or Enter calls the model (no debounce).
 */
export function AiAssistBar<S extends AssistSection>({
  section,
  context,
  label,
  placeholder,
  buttonLabel,
  hint,
  onFill,
  className,
}: AiAssistBarProps<S>) {
  const inputId = useId();
  const hintId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onFillRef = useRef(onFill);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const [fill, setFill] = useState<AssistFill | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    onFillRef.current = onFill;
  }, [onFill]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    if (busy) return;
    const promptTh = prompt.trim();
    if (promptTh.length < ASSIST_PROMPT_MIN) {
      setError(TOO_SHORT_TH);
      setTooShort(true);
      inputRef.current?.focus();
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(null);
    setTooShort(false);
    setUndone(false);
    try {
      const res = await agentApi.assist({ section, promptTh, ...context }, controller.signal);
      if (controller.signal.aborted) return;
      if (res.section !== section) throw new Error('assist answered another section');
      setFill(onFillRef.current(res as AssistResponseFor<S>));
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(errorMessageTh(e));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // Implicit submission would start the whole analysis; Enter here only asks the assist.
    e.preventDefault();
    if (!e.nativeEvent.isComposing) void run();
  };

  const undo = (e: MouseEvent<HTMLButtonElement>) => {
    if (!fill) return;
    // The undo button unmounts: keep a keyboard user's focus in the bar (a tap on a phone leaves focus alone).
    const hadFocus = e.currentTarget === document.activeElement;
    fill.undo();
    setFill(null);
    setUndone(true);
    if (hadFocus) inputRef.current?.focus();
  };

  const showHint = !!hint && !busy && !error && !fill && !undone;
  const describedBy = [showHint ? hintId : null, statusId].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 block text-label font-normal text-text">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={prompt}
          maxLength={ASSIST_PROMPT_MAX}
          autoComplete="off"
          enterKeyHint="send"
          placeholder={placeholder}
          readOnly={busy}
          aria-busy={busy || undefined}
          aria-invalid={tooShort || undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            setPrompt(e.currentTarget.value);
            if (error) setError(null);
            if (tooShort) setTooShort(false);
            if (undone) setUndone(false);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'h-14 w-full min-w-0 text-ellipsis rounded-chip border border-input bg-surface pl-4 pr-16 text-[16px] leading-[22px] font-light text-text',
            'transition-colors duration-150 hover:border-muted sm:h-12 sm:pr-14 sm:text-body',
            'focus-visible:border-accent focus-visible:outline-offset-0 focus-visible:ring-4 focus-visible:ring-accent-soft',
            'aria-[invalid=true]:border-negative aria-[invalid=true]:focus-visible:outline-negative aria-[invalid=true]:focus-visible:ring-negative-soft',
            busy && 'text-muted',
          )}
        />
        <Tooltip content={buttonLabel} repeatsLabel className="absolute right-1.5 top-1/2 inline-flex -translate-y-1/2">
          {/* aria-disabled rather than disabled while busy, so a keyboard user's focus stays on the button. */}
          <Button
            variant="ai"
            size="icon"
            aria-label={buttonLabel}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            onClick={() => void run()}
          >
            {busy ? (
              <LoaderCircle aria-hidden className="size-[18px] animate-spin" strokeWidth={1.75} />
            ) : (
              <AiSparkleIcon tone="current" size={18} />
            )}
          </Button>
        </Tooltip>
      </div>

      {showHint ? (
        <p id={hintId} className="mt-1.5 text-meta text-muted">
          {hint}
        </p>
      ) : null}

      <div id={statusId} aria-live="polite">
        {busy ? <p className="mt-1.5 text-meta text-muted">กำลังให้ AI ช่วยกรอก…</p> : null}
        {error ? <p className="mt-1.5 text-meta text-negative">{error}</p> : null}
        {fill && !busy ? (
          <div className="mt-2 flex items-start gap-2 rounded-control bg-accent-soft py-1.5 pl-3 pr-1.5">
            <AiSparkleIcon size={14} className="mt-[5px]" />
            <p className="min-w-0 flex-1 py-0.5 text-label text-text">
              {fill.noteTh} <span className="text-muted">ตรวจและแก้ต่อได้ก่อนเริ่มวิเคราะห์</span>
            </p>
            <Button size="sm" variant="tertiary" className="-my-0.5" onClick={undo}>
              <Undo2 aria-hidden className="size-4" strokeWidth={1.75} />
              ย้อนกลับ
            </Button>
          </div>
        ) : null}
        {undone && !busy ? <p className="mt-1.5 text-meta text-muted">คืนค่าเดิมให้แล้ว</p> : null}
      </div>
    </div>
  );
}
