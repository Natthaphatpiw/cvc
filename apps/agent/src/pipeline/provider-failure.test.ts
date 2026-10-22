import { ProviderError } from '@cvc/providers';
import { describe, expect, it, vi } from 'vitest';
import { MSG, isNonRetryable, providerFailure } from './context';

const http = (status: number) =>
  new ProviderError(`scrapecreators: HTTP ${status}`, { provider: 'scrapecreators', retryable: status >= 500, status });

describe('providerFailure', () => {
  it('fails the run at once when the provider refused the account on every call', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const status of [401, 402, 403]) {
      const err = providerFailure([http(status), http(status)], MSG.searchUnavailable);
      expect(isNonRetryable(err)).toBe(true);
      expect(err.message).toBe(MSG.providerAccount);
    }
  });

  it('stays retryable when any failure could be transient', () => {
    for (const errors of [[http(500)], [http(402), http(503)], [new Error('socket hang up')], []]) {
      const err = providerFailure(errors, MSG.searchUnavailable);
      expect(isNonRetryable(err)).toBe(false);
      expect(err.message).toBe(MSG.searchUnavailable);
    }
  });
});
