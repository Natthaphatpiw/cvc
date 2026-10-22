import { transcribe as aiTranscribe } from 'ai';
import { shouldStub } from './env';
import { transcriptionModel } from './models';
import { estimateTranscribeCostUsd, reportUsage } from './pricing';
import type { AiCtx } from './types';
import { TRANSCRIBE_TIMEOUT_MS, withTimeout } from './timeout';

const SUPPORTED_AUDIO = /^audio\/|^video\/(mp4|webm)/i;

/**
 * Voice note → text (Thai first). Without a model (demo mode) it returns an empty transcript; callers check
 * `transcribeAvailable()` to tell the user that voice transcription needs an OpenAI key.
 * The AI SDK detects the audio format from the bytes (webm, mp4/m4a, mp3, wav, ogg, flac, aac), so `filename` and
 * `contentType` are only used for an early type check and are never sent to the provider.
 */
export async function transcribe(audio: ArrayBuffer, filename: string, contentType: string, ctx?: AiCtx): Promise<{ text: string; durationS: number | null }> {
  if (shouldStub('transcribe')) return { text: '', durationS: null };
  if (audio.byteLength === 0) return { text: '', durationS: null };
  if (contentType && !SUPPORTED_AUDIO.test(contentType) && !/\.(webm|mp4|m4a|mp3|wav|ogg|flac|aac)$/i.test(filename)) {
    throw new Error(`transcribe: unsupported audio type ${contentType}`);
  }

  const { id, model } = transcriptionModel();
  const result = await aiTranscribe({
    model,
    audio: new Uint8Array(audio),
    // Thai with English brand words is the common case; the hint does not stop English output.
    providerOptions: { openai: { language: 'th' } },
    maxRetries: 1,
    abortSignal: withTimeout(ctx?.signal, TRANSCRIBE_TIMEOUT_MS),
  });
  const durationS = result.durationInSeconds ?? (result.segments.length ? (result.segments.at(-1)?.endSecond ?? null) : null);
  await reportUsage(ctx, { model: id, inputTokens: 0, outputTokens: 0, costUsd: estimateTranscribeCostUsd(id, durationS) });
  return { text: result.text.trim(), durationS: durationS != null && Number.isFinite(durationS) ? Math.round(durationS * 10) / 10 : null };
}
