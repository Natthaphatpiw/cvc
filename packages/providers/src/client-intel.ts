import { facebookPageApify } from './apify';
import { apifyToken, firecrawlKey, isDemoAllowed, scrapeCreatorsKey } from './env';
import { notConfigured } from './errors';
import { crawlWebsiteFirecrawl } from './firecrawl';
import { mockFacebookDocs, mockTiktokDocs, mockWebsiteDocs } from './mock/client-intel';
import { createScrapeCreatorsKolProvider } from './scrapecreators';
import { tiktokProfileDocs } from './tiktok-intel';
import type { ClientIntelProvider, ClientIntelSource } from './types';

export type ClientIntelSourceMode = 'live' | 'mock' | 'unavailable';

/** live = key present · mock = key missing and demo allowed · unavailable = key missing and DEMO_MODE=off. */
export function clientIntelSourceModes(): Record<ClientIntelSource, ClientIntelSourceMode> {
  const mode = (hasKey: boolean): ClientIntelSourceMode => (hasKey ? 'live' : isDemoAllowed() ? 'mock' : 'unavailable');
  return {
    website: mode(firecrawlKey() !== null),
    facebook: mode(apifyToken() !== null),
    tiktok: mode(scrapeCreatorsKey() !== null),
  };
}

/**
 * Each source is resolved independently on every call (env read lazily), so one missing key only turns that
 * source into sample content. `mock` is true when any source is not live; every doc also carries `meta.mock`.
 */
export function getClientIntelProvider(): ClientIntelProvider {
  const modes = clientIntelSourceModes();
  const label = (s: ClientIntelSource, live: string) => (modes[s] === 'live' ? live : modes[s]);
  return {
    name: `website:${label('website', 'firecrawl')},facebook:${label('facebook', 'apify')},tiktok:${label('tiktok', 'scrapecreators')}`,
    mock: Object.values(modes).some((m) => m !== 'live'),

    async crawlWebsite(url, maxPages) {
      const key = firecrawlKey();
      if (key) return crawlWebsiteFirecrawl(key, url, maxPages);
      if (isDemoAllowed()) return mockWebsiteDocs(url);
      throw notConfigured('firecrawl', 'FIRECRAWL_API_KEY');
    },

    async facebookPage(url, maxPosts, timeoutSec) {
      const token = apifyToken();
      if (token) return facebookPageApify(token, url, maxPosts, timeoutSec);
      if (isDemoAllowed()) return mockFacebookDocs(url);
      throw notConfigured('apify', 'APIFY_TOKEN');
    },

    async tiktokProfile(url) {
      const key = scrapeCreatorsKey();
      if (key) return tiktokProfileDocs(createScrapeCreatorsKolProvider(key), url, 20);
      if (isDemoAllowed()) return mockTiktokDocs(url);
      throw notConfigured('scrapecreators', 'SCRAPECREATORS_API_KEY');
    },
  };
}
