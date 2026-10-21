import { ProviderError, errorMessage, isRetryableStatus } from './errors';

export type JsonRequest = {
  provider: string;
  url: string;
  headers?: Record<string, string>;
  /** Per attempt. */
  timeoutMs?: number;
  /** Retries after the first attempt (429 / 5xx / network / timeout only). */
  maxRetries?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
};

export type JsonResponse = { status: number; body: unknown };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(res: Response): number | null {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function backoffMs(attempt: number, base: number): number {
  // 1x, 2x, 4x … with ±25 % jitter.
  const raw = base * 2 ** attempt;
  return Math.round(raw * (0.75 + Math.random() * 0.5));
}

/**
 * GET JSON with a per-attempt timeout and bounded retries.
 * 404 is returned to the caller (status 404, body may be null) instead of thrown so lookups can map it to null.
 */
export async function getJson(req: JsonRequest): Promise<JsonResponse> {
  const timeoutMs = req.timeoutMs ?? 15_000;
  const maxRetries = req.maxRetries ?? 2;
  const base = req.baseDelayMs ?? 600;
  let lastError: ProviderError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (req.signal?.aborted) break;
    const signal = req.signal
      ? AbortSignal.any([req.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(req.url, { method: 'GET', headers: { accept: 'application/json', ...req.headers }, signal });
    } catch (err) {
      const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      lastError = new ProviderError(
        `${req.provider}: ${isTimeout ? `timed out after ${timeoutMs} ms` : `network error: ${errorMessage(err)}`}`,
        { provider: req.provider, retryable: true, code: isTimeout ? 'timeout' : 'network', cause: err },
      );
      if (req.signal?.aborted) break;
      if (attempt < maxRetries) await sleep(backoffMs(attempt, base));
      continue;
    }

    if (res.status === 404) {
      const body = await res.json().catch(() => null);
      return { status: 404, body };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const retryable = isRetryableStatus(res.status);
      lastError = new ProviderError(`${req.provider}: HTTP ${res.status} ${text.slice(0, 200)}`.trim(), {
        provider: req.provider,
        retryable,
        status: res.status,
        code: 'http_error',
      });
      if (!retryable || attempt >= maxRetries) break;
      const wait = Math.min(retryAfterMs(res) ?? backoffMs(attempt, base), 5_000);
      await sleep(wait);
      continue;
    }

    try {
      const body: unknown = await res.json();
      return { status: res.status, body };
    } catch (err) {
      throw new ProviderError(`${req.provider}: invalid JSON response`, {
        provider: req.provider,
        retryable: false,
        status: res.status,
        code: 'bad_response',
        cause: err,
      });
    }
  }

  throw (
    lastError ??
    new ProviderError(`${req.provider}: request aborted`, { provider: req.provider, retryable: false, code: 'network' })
  );
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      const item = items[i] as T;
      out[i] = await fn(item, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
