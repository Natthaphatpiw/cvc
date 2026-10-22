/**
 * Every model call gets its own time limit on top of the caller's signal: a request that never answers (seen in
 * production as a step hanging until the 800 s function limit) becomes an error the pipeline can retry quickly.
 */
export const LLM_CALL_TIMEOUT_MS = 240_000;
export const EMBED_TIMEOUT_MS = 60_000;
export const TRANSCRIBE_TIMEOUT_MS = 120_000;

export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
