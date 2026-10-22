import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderError,
  clientIntelSourceModes,
  isAccountError,
  getClientIntelProvider,
  getKolProvider,
  isApifyConfigured,
  isFirecrawlConfigured,
  isKolProviderConfigured,
} from './index';

const KEYS = ['SCRAPECREATORS_API_KEY', 'FIRECRAWL_API_KEY', 'APIFY_TOKEN', 'DEMO_MODE'] as const;

describe('provider selection', () => {
  beforeEach(() => {
    for (const k of KEYS) vi.stubEnv(k, '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to mocks when keys are missing', async () => {
    expect(isKolProviderConfigured()).toBe(false);
    expect(isFirecrawlConfigured()).toBe(false);
    expect(isApifyConfigured()).toBe(false);
    const kol = getKolProvider();
    expect(kol.mock).toBe(true);
    expect((await kol.searchCreators({ keyword: 'skincare', limit: 5 })).length).toBe(5);

    const intel = getClientIntelProvider();
    expect(intel.mock).toBe(true);
    expect(clientIntelSourceModes()).toEqual({ website: 'mock', facebook: 'mock', tiktok: 'mock' });
    const docs = [
      ...(await intel.crawlWebsite('moonleaf-demo.co.th', 5)),
      ...(await intel.facebookPage('facebook.com/moonleafdemo', 30, 60)),
      ...(await intel.tiktokProfile('https://www.tiktok.com/@moonleaf_demo')),
    ];
    expect(docs.map((d) => d.sourceType)).toEqual(['website', 'facebook_page', 'tiktok']);
    for (const d of docs) {
      expect(d.meta.mock).toBe(true);
      expect(d.text).toContain('ข้อมูลตัวอย่าง');
    }
    await expect(intel.facebookPage('https://example.com/page', 10, 30)).rejects.toBeInstanceOf(ProviderError);
  });

  it('refuses to fake data when DEMO_MODE=off', async () => {
    vi.stubEnv('DEMO_MODE', 'off');
    const kol = getKolProvider();
    expect(kol.mock).toBe(false);
    await expect(kol.getProfile('anyone')).rejects.toMatchObject({ code: 'not_configured', retryable: false });
    expect(clientIntelSourceModes().website).toBe('unavailable');
    await expect(getClientIntelProvider().crawlWebsite('example.com', 3)).rejects.toBeInstanceOf(ProviderError);
  });

  it('switches per source when a key is present', () => {
    vi.stubEnv('FIRECRAWL_API_KEY', 'fc-test');
    expect(clientIntelSourceModes()).toEqual({ website: 'live', facebook: 'mock', tiktok: 'mock' });
    expect(getClientIntelProvider().name).toContain('website:firecrawl');
    vi.stubEnv('SCRAPECREATORS_API_KEY', 'sc-test');
    expect(getKolProvider().mock).toBe(false);
    expect(getKolProvider().name).toBe('scrapecreators');
  });
});

describe('isAccountError', () => {
  const http = (status: number) => new ProviderError(`x: HTTP ${status}`, { provider: 'x', retryable: false, status });

  it('marks refused accounts (no credits, bad or revoked key) as permanent', () => {
    expect([401, 402, 403].map((s) => isAccountError(http(s)))).toEqual([true, true, true]);
  });

  it('leaves other failures alone', () => {
    expect([400, 404, 429, 500].map((s) => isAccountError(http(s)))).toEqual([false, false, false, false]);
    expect(isAccountError(new Error('HTTP 402'))).toBe(false);
  });
});
