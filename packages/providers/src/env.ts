// All env access is lazy (called inside functions) so Next can build without secrets.

function readEnv(name: string): string | null {
  const v = process.env[name];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/** Demo/mock fallbacks are allowed unless DEMO_MODE is explicitly 'off'. */
export function isDemoAllowed(): boolean {
  return (process.env.DEMO_MODE ?? '').trim().toLowerCase() !== 'off';
}

export function scrapeCreatorsKey(): string | null {
  return readEnv('SCRAPECREATORS_API_KEY');
}

export function firecrawlKey(): string | null {
  return readEnv('FIRECRAWL_API_KEY');
}

export function apifyToken(): string | null {
  return readEnv('APIFY_TOKEN');
}

export function demoSeed(): string {
  return readEnv('DEMO_SEED') ?? 'cvc-demo';
}

export function isKolProviderConfigured(): boolean {
  return scrapeCreatorsKey() !== null;
}

export function isFirecrawlConfigured(): boolean {
  return firecrawlKey() !== null;
}

export function isApifyConfigured(): boolean {
  return apifyToken() !== null;
}

/** The client's own TikTok profile is fetched through ScrapeCreators as well. */
export function isTiktokIntelConfigured(): boolean {
  return scrapeCreatorsKey() !== null;
}
