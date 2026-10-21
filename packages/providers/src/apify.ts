import type { ActorRun, ApifyClient } from 'apify-client';
import { ProviderError, errorMessage } from './errors';
import { asArray, asBoolean, asNumber, asRecord, asString, get, median, truncate, type JsonRecord } from './json';
import type { SourceDoc } from './types';
import { MAX_DOC_CHARS } from './firecrawl';

// Actor ids and input fields verified against the public Apify actor builds (2026-10-21):
//   apify/facebook-pages-scraper  input { startUrls: [{ url }] }
//   apify/facebook-posts-scraper  input { startUrls, resultsLimit, onlyPostsNewerThan ('90 days'), captionText }
// Output is read through an explicit whitelist. `topComments`, `user`, reaction authors and any other
// commenter-level data are never read, so no commenter identity can leave this module.

const PROVIDER = 'apify';
const PAGES_ACTOR = 'apify/facebook-pages-scraper';
const POSTS_ACTOR = 'apify/facebook-posts-scraper';
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

export function normalizeFacebookUrl(input: string): string {
  const raw = input.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch (err) {
    throw new ProviderError(`${PROVIDER}: invalid Facebook URL "${input}"`, { provider: PROVIDER, retryable: false, code: 'invalid_input', cause: err });
  }
  if (!/(^|\.)(facebook\.com|fb\.com)$/i.test(url.hostname)) {
    throw new ProviderError(`${PROVIDER}: not a Facebook URL "${input}"`, { provider: PROVIDER, retryable: false, code: 'invalid_input' });
  }
  url.hostname = 'www.facebook.com';
  url.hash = '';
  return url.toString();
}

type RunResult = { run: ActorRun | null; items: JsonRecord[]; finished: boolean; error: string | null };

async function runActor(client: ApifyClient, actorId: string, input: JsonRecord, opts: { waitSecs: number; maxItems: number }): Promise<RunResult> {
  let run: ActorRun | null = null;
  try {
    run = await client.actor(actorId).call(input, {
      waitSecs: opts.waitSecs,
      log: null,
      // Hard stop on Apify's side shortly after we stop waiting, so abandoned runs do not keep billing.
      timeout: opts.waitSecs + 60,
      maxItems: opts.maxItems,
    });
    const finished = TERMINAL.has(run.status);
    // Partial results of a still-running actor are already in its default dataset.
    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: opts.maxItems, clean: true });
    if (!finished) {
      client
        .run(run.id)
        .abort()
        .catch(() => undefined);
    }
    const records = items.map((i) => asRecord(i)).filter((r): r is JsonRecord => r !== null);
    return { run, items: records, finished, error: run.status === 'SUCCEEDED' || !finished ? null : `run ${run.status}` };
  } catch (err) {
    if (run) client.run(run.id).abort().catch(() => undefined);
    return { run, items: [], finished: false, error: errorMessage(err) };
  }
}

function pageDoc(url: string, item: JsonRecord, fetchedAt: string, finished: boolean): SourceDoc {
  const title = asString(item.title) ?? asString(item.pageName) ?? url;
  const categories = asArray(item.categories).map(asString).filter((c): c is string => c !== null);
  const info = asArray(item.info).map(asString).filter((c): c is string => c !== null);
  const website = asString(item.website) ?? asString(asArray(item.websites)[0]);
  const followers = asNumber(item.followers);
  const likes = asNumber(item.likes);
  const lines = [
    `ชื่อเพจ: ${title}`,
    categories.length ? `หมวดหมู่: ${categories.join(', ')}` : null,
    followers !== null ? `ผู้ติดตาม: ${followers}` : null,
    likes !== null ? `ถูกใจเพจ: ${likes}` : null,
    asString(item.rating) ? `เรตติ้ง: ${asString(item.rating)}` : null,
    asString(item.intro) ? `แนะนำเพจ: ${asString(item.intro)}` : null,
    info.length ? `ข้อมูลเพจ:\n${info.map((l) => `- ${l}`).join('\n')}` : null,
    asString(item.priceRange) ? `ช่วงราคา: ${asString(item.priceRange)}` : null,
    asString(item.services) ? `บริการ: ${asString(item.services)}` : null,
    website ? `เว็บไซต์: ${website}` : null,
    asString(item.address) ? `ที่อยู่ธุรกิจ: ${asString(item.address)}` : null,
  ].filter((l): l is string => l !== null);
  return {
    sourceType: 'facebook_page',
    url: asString(item.pageUrl) ?? asString(item.facebookUrl) ?? url,
    title,
    text: truncate(lines.join('\n'), MAX_DOC_CHARS),
    fetchedAt,
    meta: {
      provider: PROVIDER,
      mock: false,
      partial: !finished,
      pageId: asString(item.pageId),
      followers,
      likes,
      categories,
      website,
    },
  };
}

type PostRow = {
  url: string | null;
  time: string | null;
  text: string;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  isVideo: boolean | null;
  paidPartnership: boolean | null;
  collaborators: string[];
  ocr: string[];
};

function postRow(item: JsonRecord): PostRow {
  const ocr = asArray(item.media)
    .map((m) => asString(get(m, 'ocrText')))
    .filter((t): t is string => t !== null)
    .slice(0, 3);
  // Collaborators are pages/creators co-authoring the post (useful for past-KOL detection), not commenters.
  const collaborators = asArray(item.collaborators)
    .map((c) => asString(get(c, 'name')))
    .filter((n): n is string => n !== null)
    .slice(0, 5);
  return {
    url: asString(item.url),
    time: asString(item.time),
    text: asString(item.text) ?? asString(item.previewTitle) ?? '',
    reactions: asNumber(item.likes) ?? asNumber(item.topReactionsCount),
    comments: asNumber(item.comments),
    shares: asNumber(item.shares),
    views: asNumber(item.viewsCount) ?? asNumber(item.videoPostViewCount),
    isVideo: asBoolean(item.isVideo),
    paidPartnership: asBoolean(item.paidPartnership),
    collaborators,
    ocr,
  };
}

function postsDoc(url: string, pageTitle: string | null, items: JsonRecord[], fetchedAt: string, finished: boolean): SourceDoc {
  const rows = items
    .map(postRow)
    .sort((a, b) => (b.time ? Date.parse(b.time) : 0) - (a.time ? Date.parse(a.time) : 0));
  const engagement = rows.map((r) => (r.reactions ?? 0) + (r.comments ?? 0) + (r.shares ?? 0));
  const times = rows.map((r) => (r.time ? Date.parse(r.time) : NaN)).filter((t) => Number.isFinite(t));
  const spanWeeks = times.length >= 2 ? Math.max(1, (Math.max(...times) - Math.min(...times)) / (7 * 86_400_000)) : null;
  const postsPerWeek = spanWeeks ? Number((rows.length / spanWeeks).toFixed(2)) : null;
  const medianEngagement = median(engagement);
  const videoShare = rows.length ? rows.filter((r) => r.isVideo).length / rows.length : null;
  const paidCount = rows.filter((r) => r.paidPartnership).length;
  const collaboratorNames = [...new Set(rows.flatMap((r) => r.collaborators))].slice(0, 20);

  const header = [
    `โพสต์ล่าสุดจากเพจ ${pageTitle ?? url} (${rows.length} โพสต์${finished ? '' : ', ข้อมูลบางส่วนเนื่องจากหมดเวลา'})`,
    medianEngagement !== null ? `ค่ามัธยฐาน reactions+comments+shares ต่อโพสต์: ${medianEngagement}` : null,
    postsPerWeek !== null ? `ความถี่โพสต์: ${postsPerWeek} โพสต์/สัปดาห์` : null,
    videoShare !== null ? `สัดส่วนโพสต์วิดีโอ: ${Math.round(videoShare * 100)}%` : null,
    paidCount ? `โพสต์ที่ติดป้าย paid partnership: ${paidCount}` : null,
    collaboratorNames.length ? `เพจ/ครีเอเตอร์ที่ร่วมโพสต์: ${collaboratorNames.join(', ')}` : null,
  ].filter((l): l is string => l !== null);

  const body = rows.map((r, i) => {
    const stats = [
      r.reactions !== null ? `reactions ${r.reactions}` : null,
      r.comments !== null ? `comments ${r.comments}` : null,
      r.shares !== null ? `shares ${r.shares}` : null,
      r.views !== null ? `views ${r.views}` : null,
      r.isVideo ? 'video' : null,
      r.paidPartnership ? 'paid partnership' : null,
    ].filter(Boolean);
    const ocr = r.ocr.length ? `\n  ข้อความในภาพ: ${truncate(r.ocr.join(' / '), 200)}` : '';
    return `[${i + 1}] ${r.time?.slice(0, 10) ?? 'ไม่ทราบวันที่'} · ${stats.join(' · ')}\n  ${truncate(r.text.replace(/\s+/g, ' '), 400)}${ocr}`;
  });

  return {
    sourceType: 'facebook_posts',
    url,
    title: `โพสต์ล่าสุด: ${pageTitle ?? url}`,
    text: truncate([...header, '', ...body].join('\n'), MAX_DOC_CHARS),
    fetchedAt,
    meta: {
      provider: PROVIDER,
      mock: false,
      partial: !finished,
      postCount: rows.length,
      medianEngagement,
      postsPerWeek,
      videoShare,
      paidPartnershipCount: paidCount,
      collaborators: collaboratorNames,
      posts: rows.map((r) => ({
        url: r.url,
        time: r.time,
        reactions: r.reactions,
        comments: r.comments,
        shares: r.shares,
        views: r.views,
        isVideo: r.isVideo,
        paidPartnership: r.paidPartnership,
      })),
    },
  };
}

/**
 * Runs the page-details and posts actors in parallel. Waits at most `timeoutSec` (via `waitSecs`), then returns
 * whatever finished, including partial post datasets, and aborts runs that are still going.
 */
export async function facebookPageApify(token: string, inputUrl: string, maxPosts: number, timeoutSec: number): Promise<SourceDoc[]> {
  const url = normalizeFacebookUrl(inputUrl);
  const posts = Math.max(1, Math.min(50, Math.floor(maxPosts)));
  // Leave a few seconds of the budget for dataset reads.
  const waitSecs = Math.max(10, Math.floor(timeoutSec) - 8);
  const { ApifyClient } = await import('apify-client');
  const client = new ApifyClient({ token, maxRetries: 2, timeoutSecs: 30 });

  const [page, feed] = await Promise.all([
    runActor(client, PAGES_ACTOR, { startUrls: [{ url }] }, { waitSecs, maxItems: 1 }),
    runActor(
      client,
      POSTS_ACTOR,
      { startUrls: [{ url }], resultsLimit: posts, onlyPostsNewerThan: '90 days', captionText: false },
      { waitSecs, maxItems: posts },
    ),
  ]);

  const fetchedAt = new Date().toISOString();
  const docs: SourceDoc[] = [];
  const pageItem = page.items[0];
  if (pageItem) docs.push(pageDoc(url, pageItem, fetchedAt, page.finished));
  if (feed.items.length > 0) {
    docs.push(postsDoc(url, pageItem ? asString(pageItem.title) : null, feed.items.slice(0, posts), fetchedAt, feed.finished));
  }
  if (docs.length === 0) {
    const reason = [page.error, feed.error].filter(Boolean).join('; ') || 'no data before timeout';
    throw new ProviderError(`${PROVIDER}: facebook page ${url}: ${reason}`, { provider: PROVIDER, retryable: true, code: 'bad_response' });
  }
  return docs;
}
