export type ProviderErrorCode =
  | 'not_configured'
  | 'http_error'
  | 'timeout'
  | 'network'
  | 'bad_response'
  | 'invalid_input';

export class ProviderError extends Error {
  retryable: boolean;
  status?: number;
  provider: string;
  code: ProviderErrorCode;

  constructor(
    message: string,
    opts: { provider: string; retryable: boolean; status?: number; code?: ProviderErrorCode; cause?: unknown },
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'ProviderError';
    this.provider = opts.provider;
    this.retryable = opts.retryable;
    this.code = opts.code ?? 'http_error';
    if (opts.status !== undefined) this.status = opts.status;
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function notConfigured(provider: string, envName: string): ProviderError {
  return new ProviderError(`${provider} is not configured (${envName} missing and DEMO_MODE=off)`, {
    provider,
    retryable: false,
    code: 'not_configured',
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
