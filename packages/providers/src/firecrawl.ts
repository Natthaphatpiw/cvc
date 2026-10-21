import type { Document, MapData } from '@mendable/firecrawl-js';
import { ProviderError, errorMessage } from './errors';
import { mapPool } from './http';
import { truncate } from './json';
import type { SourceDoc } from './types';

const PROVIDER = 'firecrawl';
export const MAX_DOC_CHARS = 12_000;
const LOCATION = { country: 'TH', languages: ['th', 'en'] };

/** Adds https:// when missing and rejects non-http(s) schemes. */
export function normalizeWebsiteUrl(input: string): URL {
  const raw = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch (err) {
    throw new ProviderError(`${PROVIDER}: invalid URL "${input}"`, { provider: PROVIDER, retryable: false, code: 'invalid_input', cause: err });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ProviderError(`${PROVIDER}: unsupported URL scheme ${url.protocol}`, { provider: PROVIDER, retryable: false, code: 'invalid_input' });
  }
  url.hash = '';
  return url;
}

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');

const SKIP_PATH =
  /\/(cart|checkout|account|login|signin|sign-in|register|signup|wp-admin|wp-login|search|tag|tags|author|feed|cdn-cgi)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|xml|json|css|js|mp4|mp3)$/i;
const PRIORITY: [RegExp, number][] = [
  [/about|story|brand|who-we-are|เกี่ยวกับ|เรื่องราว|แบรนด์/i, 6],
  [/product|products|shop|collection|catalog|menu|service|สินค้า|เมนู|บริการ|ร้าน/i, 5],
  [/ingredient|technology|review|faq|promotion|promo|ส่วนผสม|รีวิว|โปรโมชั่น|คำถาม/i, 3],
  [/contact|ติดต่อ/i, 1],
  [/blog|news|article|บทความ|ข่าว/i, 1],
];

function scorePath(u: URL): number {
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the encoded path
  }
  let score = 0;
  for (const [re, s] of PRIORITY) if (re.test(path)) score = Math.max(score, s);
  const depth = path.split('/').filter(Boolean).length;
  return score - depth * 0.5;
}

/** Root first, then same-site pages ranked by how much brand information they usually carry. */
export function selectPages(root: URL, links: string[], maxPages: number): string[] {
  const rootHost = bareHost(root.hostname);
  const seen = new Set<string>();
  const key = (u: URL) => `${bareHost(u.hostname)}${u.pathname.replace(/\/+$/, '')}`;
  seen.add(key(root));
  const candidates: { url: string; score: number }[] = [];
  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link, root);
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') continue;
    if (bareHost(u.hostname) !== rootHost) continue;
    if (u.search || SKIP_PATH.test(u.pathname)) continue;
    const k = key(u);
    if (seen.has(k)) continue;
    seen.add(k);
    u.hash = '';
    candidates.push({ url: u.toString(), score: scorePath(u) });
  }
  candidates.sort((a, b) => b.score - a.score || a.url.length - b.url.length);
  return [root.toString(), ...candidates.slice(0, Math.max(0, maxPages - 1)).map((c) => c.url)];
}

/** Markdown → plain-ish text: drop images, unwrap links, drop nav-like noise, collapse whitespace. */
export function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l) => !/^\s*([*\-|=_#>]\s*)*$/.test(l) || l.trim() === '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Removes lines repeated on two or more pages (headers, footers, cookie banners). */
export function stripCrossPageBoilerplate(texts: string[]): string[] {
  if (texts.length < 2) return texts;
  const counts = new Map<string, number>();
  for (const t of texts) {
    const unique = new Set(t.split('\n').map((l) => l.trim()).filter((l) => l.length > 0));
    for (const l of unique) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return texts.map((t) =>
    t
      .split('\n')
      .filter((l) => {
        const k = l.trim();
        return k.length === 0 || (counts.get(k) ?? 0) < 2 || k.length > 200;
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

const SOCIAL = /(facebook\.com|fb\.com|tiktok\.com|instagram\.com|youtube\.com|line\.me|lin\.ee|x\.com|twitter\.com|shopee\.co\.th|lazada\.co\.th)/i;

export async function crawlWebsiteFirecrawl(apiKey: string, inputUrl: string, maxPages: number): Promise<SourceDoc[]> {
  const root = normalizeWebsiteUrl(inputUrl);
  const pagesWanted = Math.max(1, Math.min(10, Math.floor(maxPages)));
  const { Firecrawl } = await import('@mendable/firecrawl-js');
  const fc = new Firecrawl({ apiKey, timeoutMs: 45_000, maxRetries: 1 });

  let links: string[] = [];
  if (pagesWanted > 1) {
    try {
      const map: MapData = await fc.map(root.toString(), { limit: 50, location: LOCATION, ignoreQueryParameters: true });
      links = map.links.map((l) => l.url);
    } catch (err) {
      console.warn(`[providers] firecrawl map failed for ${root.host}: ${errorMessage(err)}`);
    }
  }
  const urls = selectPages(root, links, pagesWanted);

  const scraped = await mapPool(urls, 3, async (url, i): Promise<{ url: string; doc: Document } | null> => {
    try {
      const doc = await fc.scrape(url, {
        formats: i === 0 ? ['markdown', 'links'] : ['markdown'],
        onlyMainContent: true,
        location: LOCATION,
        blockAds: true,
        removeBase64Images: true,
        timeout: 30_000,
      });
      return { url, doc };
    } catch (err) {
      console.warn(`[providers] firecrawl scrape failed for ${url}: ${errorMessage(err)}`);
      return null;
    }
  });

  const ok = scraped.filter((s): s is { url: string; doc: Document } => s !== null && Boolean(s.doc.markdown));
  if (ok.length === 0) {
    throw new ProviderError(`${PROVIDER}: no page of ${root.host} could be scraped`, { provider: PROVIDER, retryable: true, code: 'bad_response' });
  }
  const texts = stripCrossPageBoilerplate(ok.map((s) => cleanMarkdown(s.doc.markdown ?? '')));
  const fetchedAt = new Date().toISOString();
  const socialLinks = [...new Set((ok[0]?.doc.links ?? []).filter((l) => SOCIAL.test(l)))].slice(0, 20);

  return ok
    .map((s, i): SourceDoc => {
      const meta = s.doc.metadata;
      const text = texts[i] ?? '';
      return {
        sourceType: 'website',
        url: meta?.sourceURL ?? s.url,
        title: meta?.title ?? meta?.ogTitle ?? s.url,
        text: truncate(text, MAX_DOC_CHARS),
        fetchedAt,
        meta: {
          provider: PROVIDER,
          mock: false,
          description: meta?.description ?? meta?.ogDescription ?? null,
          language: meta?.language ?? null,
          siteName: meta?.ogSiteName ?? null,
          statusCode: meta?.statusCode ?? null,
          truncated: text.length > MAX_DOC_CHARS,
          ...(i === 0 ? { socialLinks } : {}),
        },
      };
    })
    .filter((d) => d.text.length > 0);
}
