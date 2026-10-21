import { demoSeed, isDemoAllowed, scrapeCreatorsKey } from './env';
import { notConfigured } from './errors';
import { createMockKolProvider } from './mock/kol';
import { createScrapeCreatorsKolProvider } from './scrapecreators';
import type { KolDataProvider } from './types';

// Memoized per key/seed so the live provider's handle→uid/region cache survives across calls in one process.
let live: { key: string; provider: KolDataProvider } | null = null;
const mocks = new Map<string, KolDataProvider>();

function unconfiguredKolProvider(): KolDataProvider {
  const fail = async (): Promise<never> => {
    throw notConfigured('scrapecreators', 'SCRAPECREATORS_API_KEY');
  };
  return { name: 'unconfigured', mock: false, searchCreators: fail, getProfile: fail, getVideos: fail };
}

/** ScrapeCreators when SCRAPECREATORS_API_KEY is set; otherwise the seeded mock (unless DEMO_MODE=off). */
export function getKolProvider(): KolDataProvider {
  const key = scrapeCreatorsKey();
  if (key) {
    if (!live || live.key !== key) live = { key, provider: createScrapeCreatorsKolProvider(key) };
    return live.provider;
  }
  // DEMO_MODE=off without a key: calls reject with a non-retryable ProviderError instead of returning fake data.
  if (!isDemoAllowed()) return unconfiguredKolProvider();
  const seed = demoSeed();
  let mock = mocks.get(seed);
  if (!mock) {
    mock = createMockKolProvider(seed);
    mocks.set(seed, mock);
  }
  return mock;
}
