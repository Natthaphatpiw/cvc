'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import type { RunAsset, VoiceTranscript } from '@cvc/schemas';
import { agentApi, errorMessageTh } from '@/lib/api';
import { formatBytes, formatClock } from '@/lib/format';
import { openExternal } from '@/lib/liff';
import { MAX_AUDIO_BYTES, MAX_AUDIO_SEC, audioDuration, resolveContentType, uploadAsset } from '@/lib/uploads';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';

type State =
  | { kind: 'idle' }
  | { kind: 'recording'; elapsed: number }
  | { kind: 'uploading'; label: string; progress: number }
  | { kind: 'transcribing'; label: string; asset: RunAsset }
  | { kind: 'ready'; label: string; asset: RunAsset; original: string; text: string; transcribeError: string | null };

export type VoiceValue = { asset: RunAsset | null; transcript: VoiceTranscript | null; busy: boolean };

export type VoiceInputProps = {
  disabled: boolean;
  isLiff: boolean;
  onChange: (v: VoiceValue) => void;
};

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

function extFor(contentType: string): string {
  if (contentType.includes('mp4') || contentType.includes('m4a')) return 'm4a';
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('wav')) return 'wav';
  return 'webm';
}

/** Voice note (≤ 3 min): record or upload → private upload → transcribe → editable transcript. */
export function VoiceInput({ disabled, isLiff, onChange }: VoiceInputProps) {
  const fileId = useId();
  const transcriptId = useId();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState<boolean | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Bumped on reset so late upload/transcribe results from a discarded note are ignored. */
  const genRef = useRef(0);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setMicSupported(typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  useEffect(() => {
    const busy = state.kind === 'recording' || state.kind === 'uploading' || state.kind === 'transcribing';
    if (state.kind === 'ready') {
      const text = state.text.trim();
      onChangeRef.current({
        asset: state.asset,
        transcript: text
          ? { assetPathname: state.asset.pathname, text: text.slice(0, 8000), userEdited: state.text !== state.original }
          : null,
        busy: false,
      });
    } else if (state.kind === 'transcribing') {
      onChangeRef.current({ asset: state.asset, transcript: null, busy: true });
    } else {
      onChangeRef.current({ asset: null, transcript: null, busy });
    }
  }, [state]);

  const stopTracks = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      stopTracks();
    },
    [stopTracks],
  );

  const transcribe = useCallback(async (asset: RunAsset, label: string) => {
    const gen = genRef.current;
    setState({ kind: 'transcribing', label, asset });
    try {
      const res = await agentApi.transcribe(asset.pathname);
      if (gen !== genRef.current) return;
      setState({ kind: 'ready', label, asset, original: res.transcript, text: res.transcript, transcribeError: null });
    } catch (e) {
      if (gen !== genRef.current) return;
      setState({
        kind: 'ready',
        label,
        asset,
        original: '',
        text: '',
        transcribeError: `ถอดเสียงไม่สำเร็จ (${errorMessageTh(e)}) พิมพ์สรุปสิ่งที่เล่าไว้ในช่องนี้แทนได้ หรือส่งไปพร้อมไฟล์เสียงให้ระบบถอดเอง`,
      });
    }
  }, []);

  const handleAudio = useCallback(
    async (blob: Blob, fileName: string, label: string) => {
      setError(null);
      const contentType = resolveContentType(blob, fileName);
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ kind: 'uploading', label, progress: 0 });
      try {
        const asset = await uploadAsset({
          file: blob,
          fileName,
          contentType,
          kind: 'voice',
          signal: controller.signal,
          onProgress: (progress) => setState((s) => (s.kind === 'uploading' ? { ...s, progress } : s)),
        });
        await transcribe(asset, label);
      } catch (e) {
        if (controller.signal.aborted) return;
        setState({ kind: 'idle' });
        setError(errorMessageTh(e));
      }
    },
    [transcribe],
  );

  const startRecording = async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        isLiff
          ? 'ใช้ไมโครโฟนใน LINE ไม่ได้ ลองอัปโหลดไฟล์เสียง หรือเปิดหน้านี้ในเบราว์เซอร์'
          : 'ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน อนุญาตในการตั้งค่าเบราว์เซอร์ หรืออัปโหลดไฟล์เสียงแทน',
      );
      return;
    }
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError('เบราว์เซอร์นี้อัดเสียงไม่ได้ อัปโหลดไฟล์เสียงแทนได้');
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stopTracks();
      const type = rec.mimeType || mime || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const seconds = Math.min(MAX_AUDIO_SEC, Math.round((Date.now() - startedAtRef.current) / 1000));
      if (blob.size === 0) {
        setState({ kind: 'idle' });
        setError('ไม่ได้ยินเสียง ลองอัดใหม่อีกครั้ง');
        return;
      }
      void handleAudio(blob, `voice-note.${extFor(type)}`, `บันทึกเสียง ${formatClock(seconds)}`);
    };
    streamRef.current = stream;
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    rec.start(1000);
    setState({ kind: 'recording', elapsed: 0 });
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      if (elapsed >= MAX_AUDIO_SEC && rec.state === 'recording') rec.stop();
      setState((s) => (s.kind === 'recording' ? { kind: 'recording', elapsed } : s));
    }, 250);
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state === 'recording') rec.stop();
  };

  const onFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('audio/') && !/\.(m4a|mp3|wav|webm|ogg)$/i.test(file.name)) {
      setError('รองรับเฉพาะไฟล์เสียง เช่น m4a, mp3, wav, webm');
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setError(`ไฟล์ขนาด ${formatBytes(file.size)} เกิน 25 MB`);
      return;
    }
    const duration = await audioDuration(file);
    if (duration !== null && duration > MAX_AUDIO_SEC + 1) {
      setError(`ไฟล์ยาว ${formatClock(duration)} นาที เกิน 3 นาที ตัดให้สั้นลงแล้วลองใหม่`);
      return;
    }
    await handleAudio(file, file.name || 'voice-note.m4a', duration !== null ? `${file.name} · ${formatClock(duration)}` : file.name);
  };

  const reset = () => {
    genRef.current += 1;
    abortRef.current?.abort();
    setError(null);
    setState({ kind: 'idle' });
  };

  if (disabled) return null;

  return (
    <div>
      {state.kind === 'idle' ? (
        <div className="flex flex-wrap items-center gap-2">
          {micSupported ? (
            <Button onClick={() => void startRecording()}>
              <Mic aria-hidden className="size-4 text-muted" strokeWidth={1.5} />
              อัดเสียง
            </Button>
          ) : null}
          <label
            htmlFor={fileId}
            className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-control sm:h-9 border border-control bg-surface px-3.5 text-body font-normal text-text transition-colors duration-150 hover:bg-raised has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
          >
            <Upload aria-hidden className="size-4 text-muted" strokeWidth={1.5} />
            อัปโหลดไฟล์เสียง
            <input
              id={fileId}
              type="file"
              accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg"
              className="sr-only"
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = '';
                if (f) void onFile(f);
              }}
            />
          </label>
          <span className="text-meta text-muted">เล่าเรื่องแบรนด์ สินค้า หรือกลุ่มลูกค้า สูงสุด 3 นาที</span>
        </div>
      ) : null}

      {micSupported === false && state.kind === 'idle' ? (
        <p className="mt-2 text-meta text-muted">
          เบราว์เซอร์นี้อัดเสียงไม่ได้ อัปโหลดไฟล์เสียงแทนได้
          {isLiff ? (
            <>
              {' '}
              หรือ{' '}
              <button type="button" className="text-accent hover:text-accent-ink" onClick={() => openExternal(window.location.href)}>
                เปิดในเบราว์เซอร์
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {state.kind === 'recording' ? (
        <div className="flex flex-wrap items-center gap-3" aria-live="polite">
          <span className="inline-flex items-center gap-2 text-body text-text">
            <span aria-hidden className="size-2 rounded-full bg-negative" />
            กำลังอัด
          </span>
          <output className="num text-body text-text" aria-label="เวลาที่อัด">
            {formatClock(state.elapsed)} / {formatClock(MAX_AUDIO_SEC)}
          </output>
          <Button onClick={stopRecording}>
            <Square aria-hidden className="size-3.5 text-muted" strokeWidth={1.75} />
            หยุดอัด
          </Button>
        </div>
      ) : null}

      {state.kind === 'uploading' || state.kind === 'transcribing' ? (
        <div className="max-w-sm" aria-live="polite">
          <p className="text-body text-text">{state.label}</p>
          <p className="mt-0.5 text-meta text-muted">{state.kind === 'uploading' ? 'กำลังอัปโหลด…' : 'กำลังถอดเสียง…'}</p>
          <div
            role="progressbar"
            aria-label={state.kind === 'uploading' ? 'กำลังอัปโหลดไฟล์เสียง' : 'กำลังถอดเสียง'}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.kind === 'uploading' ? state.progress : undefined}
            className="mt-2 h-1 overflow-hidden rounded-full bg-accent-track"
          >
            <div
              className={state.kind === 'transcribing' ? 'h-full w-1/3 animate-pulse-soft bg-accent' /* taste-skill-ignore: busy bar */ : 'h-full bg-accent transition-[width] duration-150'}
              style={state.kind === 'uploading' ? { width: `${state.progress}%` } : undefined}
            />
          </div>
          <Button size="sm" variant="tertiary" className="mt-2" onClick={reset}>
            ยกเลิก
          </Button>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 truncate text-body text-text">{state.label}</p>
            <Button size="sm" variant="tertiary" onClick={reset}>
              ลบและอัดใหม่
            </Button>
          </div>
          <label htmlFor={transcriptId} className="mb-1.5 block text-label font-normal text-text">
            {state.transcribeError ? 'สรุปสิ่งที่เล่า' : 'ถอดเสียงแล้ว แก้ไขได้ก่อนส่ง'}
          </label>
          <Textarea
            id={transcriptId}
            rows={5}
            maxLength={8000}
            value={state.text}
            onChange={(e) => {
              const text = e.currentTarget.value;
              setState((s) => (s.kind === 'ready' ? { ...s, text } : s));
            }}
            aria-describedby={state.transcribeError ? `${transcriptId}-err` : undefined}
          />
          {state.transcribeError ? (
            <div id={`${transcriptId}-err`} className="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-warning">
              <span>{state.transcribeError}</span>
              <button
                type="button"
                className="text-accent hover:text-accent-ink"
                onClick={() => void transcribe(state.asset, state.label)}
              >
                ลองถอดเสียงอีกครั้ง
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-meta text-negative">
          {error}
        </p>
      ) : null}
    </div>
  );
}
