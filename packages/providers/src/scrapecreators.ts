import type { CandidateRef, CreatorProfile, CreatorVideo } from '@cvc/schemas';
import { thaiShare } from '@cvc/thai';
import { ProviderError } from './errors';
import { getJson } from './http';
import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  firstOf,
  get,
  imageUrl,
  type JsonRecord,
} from './json';
import type { KolDataProvider } from './types';

// Endpoints and parameters below were checked against the public OpenAPI spec at
// https://docs.scrapecreators.com/openapi.json (2026-10-21):
//   GET /v1/tiktok/profile          ?handle | user_id
//   GET /v1/tiktok/profile/region   ?handle
//   GET /v3/tiktok/profile/videos   ?handle&user_id&sort_by=latest&max_cursor&region&include_pinned
//   GET /v1/tiktok/search/keyword   ?query&region&date_posted&sort_by&cursor   (region only moves the proxy)
//   GET /v1/tiktok/search/users     ?query&cursor
// The spec's prose and examples disagree on wrappers (`aweme_info` / `user_info`), so both shapes are parsed.

const PROVIDER = 'scrapecreators';
const BASE_URL = 'https://api.scrapecreators.com';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export class ScrapeCreatorsClient {
  constructor(private readonly apiKey: string) {}

  /** Returns null on 404. Throws ProviderError otherwise. */
  async get(path: string, params: Record<string, string | number | boolean | null | undefined>): Promise<JsonRecord | null> {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    const res = await getJson({
      provider: PROVIDER,
      url: url.toString(),
      headers: { 'x-api-key': this.apiKey },
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
    if (res.status === 404) return null;
    const body = asRecord(res.body);
    if (!body) {
      throw new ProviderError(`${PROVIDER}: unexpected response shape for ${path}`, {
        provider: PROVIDER,
        retryable: false,
        code: 'bad_response',
      });
    }
    if (body.success === false) {
      const msg = asString(body.message) ?? asString(body.error) ?? 'request failed';
      throw new ProviderError(`${PROVIDER}: ${path}: ${msg}`, { provider: PROVIDER, retryable: false, code: 'bad_response' });
    }
    return body;
  }
}

// ---------------------------------------------------------------------------------------------
// Normalizers (pure)
// ---------------------------------------------------------------------------------------------

function inferLanguage(text: string, fallback: string | null): string | null {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) return fallback;
  return thaiShare(text) >= 0.3 ? 'th' : fallback;
}

function normalizeLang(v: unknown): string | null {
  const s = asString(v)?.toLowerCase() ?? null;
  if (!s || s === 'un' || s === 'und') return null;
  return s;
}

function upperRegion(v: unknown): string | null {
  const s = asString(v);
  return s ? s.toUpperCase() : null;
}

function unwrapProfile(raw: unknown): { user: JsonRecord; stats: JsonRecord | null } | null {
  const r = asRecord(raw);
  if (!r) return null;
  const userInfo = asRecord(r.userInfo);
  if (userInfo) return unwrapProfile(userInfo);
  const nested = asRecord(r.user_info);
  if (nested) return { user: nested, stats: null };
  const user = asRecord(r.user);
  if (user) return { user, stats: asRecord(r.stats) ?? asRecord(r.statsV2) };
  return { user: r, stats: asRecord(r.stats) };
}

function verifiedOf(user: JsonRecord): boolean | null {
  const direct = asBoolean(user.verified);
  if (direct !== null) return direct;
  if (asString(user.custom_verify) || asString(user.enterprise_verify_reason)) return true;
  return 'custom_verify' in user ? false : null;
}

function avatarOf(user: JsonRecord): string | null {
  return firstOf(
    [user.avatarLarger, user.avatar_larger, user.avatar_300x300, user.avatarMedium, user.avatar_medium, user.avatarThumb, user.avatar_thumb],
    imageUrl,
  );
}

/** Accepts the /v1/tiktok/profile body ({ user, stats }), an aweme `author`, or a users-search row. */
export function normalizeScrapeCreatorsProfile(raw: unknown): CreatorProfile {
  const unwrapped = unwrapProfile(raw);
  const user = unwrapped?.user ?? null;
  const stats = unwrapped?.stats ?? null;
  const id = user ? firstOf([user.id, user.uid, user.user_id], asString) : null;
  const handle = user ? firstOf([user.uniqueId, user.unique_id, user.handle], asString) : null;
  if (!user || (!id && !handle)) {
    throw new ProviderError(`${PROVIDER}: profile payload has no user id or handle`, {
      provider: PROVIDER,
      retryable: false,
      code: 'bad_response',
    });
  }
  const displayName = firstOf([user.nickname, user.nickName], asString);
  const bio = firstOf([user.signature, user.bio], asString);
  const commerceLevel = asNumber(user.commerce_user_level);
  return {
    platform: 'tiktok',
    platformUserId: id ?? (handle as string),
    handle: (handle ?? (id as string)).replace(/^@/, ''),
    displayName,
    bio,
    bioLink: firstOf([get(user, 'bioLink', 'link'), get(user, 'bio_link', 'link'), user.bio_url], asString),
    avatarSourceUrl: avatarOf(user),
    isVerified: verifiedOf(user),
    region: firstOf([user.region, user.account_region], upperRegion),
    language: inferLanguage(`${displayName ?? ''} ${bio ?? ''}`, normalizeLang(user.language)),
    isShopSeller: firstOf([user.ttSeller, user.with_shop_entry], asBoolean),
    isCommerceUser:
      asBoolean(get(user, 'commerceUserInfo', 'commerceUser')) ??
      (commerceLevel !== null ? commerceLevel > 0 : null) ??
      asBoolean(user.with_commerce_entry),
    followerCount: firstOf([stats?.followerCount, user.follower_count, user.followerCount], asNumber),
    followingCount: firstOf([stats?.followingCount, user.following_count, user.followingCount], asNumber),
    likesCount: firstOf([stats?.heartCount, stats?.heart, user.total_favorited, user.heartCount], asNumber),
    videoCount: firstOf([stats?.videoCount, user.aweme_count, user.videoCount], asNumber),
  };
}

function unwrapVideo(raw: unknown): JsonRecord | null {
  const r = asRecord(raw);
  if (!r) return null;
  return asRecord(r.aweme_info) ?? asRecord(r.itemStruct) ?? asRecord(r.aweme_detail) ?? r;
}

function postedAtOf(v: JsonRecord): string | null {
  const secs = firstOf([v.create_time, v.createTime], asNumber);
  if (secs !== null && secs > 0) return new Date(secs * 1000).toISOString();
  const iso = asString(v.create_time_utc);
  if (iso && Number.isFinite(Date.parse(iso))) return new Date(iso).toISOString();
  return null;
}

function durationOf(v: JsonRecord): number | null {
  const d = firstOf([get(v, 'video', 'duration'), v.duration], asNumber);
  if (d === null || d <= 0) return null;
  // App payloads report milliseconds, web payloads seconds.
  return d >= 1000 ? Math.round(d / 1000) : d;
}

function hashtagsOf(v: JsonRecord, caption: string | null): string[] {
  const tags: string[] = [];
  for (const t of asArray(v.text_extra)) {
    const name = asString(get(t, 'hashtag_name'));
    if (name) tags.push(name);
  }
  for (const t of asArray(v.textExtra)) {
    const name = asString(get(t, 'hashtagName'));
    if (name) tags.push(name);
  }
  for (const c of asArray(v.cha_list)) {
    const name = asString(get(c, 'cha_name'));
    if (name) tags.push(name);
  }
  for (const c of asArray(v.challenges)) {
    const name = asString(get(c, 'title'));
    if (name) tags.push(name);
  }
  if (tags.length === 0 && caption) {
    for (const m of caption.matchAll(/#([\p{L}\p{M}\p{N}_]+)/gu)) if (m[1]) tags.push(m[1]);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const k = t.replace(/^#/, '').toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** TikTok "paid partnership" / branded-content flags; null when the payload carries none of them. */
function positive(v: unknown): boolean | null {
  const n = asNumber(v);
  return n === null ? null : n > 0;
}

function sponsoredOf(v: JsonRecord): boolean | null {
  const signals: (boolean | null)[] = [
    asBoolean(v.is_paid_partnership),
    asBoolean(v.isPaidPartnership),
    positive(get(v, 'commerce_info', 'branded_content_type')),
    positive(v.branded_content_type),
    asBoolean(v.brandedContent),
  ];
  if (signals.some((s) => s === true)) return true;
  if (signals.some((s) => s === false)) return false;
  return null;
}

function shopOf(v: JsonRecord): boolean | null {
  if (asString(v.shop_product_url)) return true;
  if (asArray(v.products_info).length > 0) return true;
  for (const a of [...asArray(v.anchors), ...asArray(v.anchor_info)]) {
    const s = JSON.stringify(a ?? '').slice(0, 2_000).toLowerCase();
    if (s.includes('shop') || s.includes('product') || s.includes('ecom')) return true;
  }
  // Assumption: ScrapeCreators adds `shop_product_url` to app-shaped items whenever a product is attached,
  // so an app-shaped item without it has no shop product. Web-shaped items stay unknown.
  return 'aweme_id' in v ? false : null;
}

function coverOf(v: JsonRecord): string | null {
  const video = asRecord(v.video);
  if (!video) return null;
  return firstOf([video.cover, video.origin_cover, video.originCover, video.dynamic_cover, video.dynamicCover], imageUrl);
}

/** Accepts an aweme item (app shape), a search row ({ aweme_info }), or a web itemStruct. */
export function normalizeScrapeCreatorsVideo(raw: unknown): CreatorVideo {
  const v = unwrapVideo(raw);
  const id = v ? firstOf([v.aweme_id, v.id, get(v, 'statistics', 'aweme_id')], asString) : null;
  if (!v || !id) {
    throw new ProviderError(`${PROVIDER}: video payload has no id`, { provider: PROVIDER, retryable: false, code: 'bad_response' });
  }
  const caption = firstOf([v.desc, v.description], asString);
  const stats = asRecord(v.statistics) ?? asRecord(v.stats) ?? {};
  const authorHandle = firstOf([get(v, 'author', 'unique_id'), get(v, 'author', 'uniqueId')], asString);
  const shareUrl = asString(v.share_url)?.split('?')[0] ?? null;
  const url =
    asString(v.url) ??
    shareUrl ??
    (authorHandle ? `https://www.tiktok.com/@${authorHandle}/video/${id}` : `https://www.tiktok.com/video/${id}`);
  return {
    platformVideoId: id,
    url,
    postedAt: postedAtOf(v),
    caption,
    hashtags: hashtagsOf(v, caption),
    durationS: durationOf(v),
    views: firstOf([stats.play_count, stats.playCount], asNumber),
    likes: firstOf([stats.digg_count, stats.diggCount], asNumber),
    comments: firstOf([stats.comment_count, stats.commentCount], asNumber),
    shares: firstOf([stats.share_count, stats.shareCount], asNumber),
    saves: firstOf([stats.collect_count, stats.collectCount], asNumber),
    isSponsored: sponsoredOf(v),
    isAd: firstOf([v.is_ad, v.isAd, v.is_ads], asBoolean),
    hasShopProduct: shopOf(v),
    locationCreated: firstOf([v.location_created, v.locationCreated, v.region], upperRegion),
    textLanguage: firstOf([v.desc_language, v.textLanguage], normalizeLang) ?? (caption ? inferLanguage(caption, null) : null),
    coverSourceUrl: coverOf(v),
  };
}

// ---------------------------------------------------------------------------------------------
// Live provider
// ---------------------------------------------------------------------------------------------

type Known = { uid: string; region: string | null };

type Hit = {
  ref: CandidateRef;
  text: string;
};

function hitFromAuthor(author: JsonRecord, extra: { region: string | null; postedAt: string | null; text: string }, matchedQuery: string): Hit | null {
  const uid = firstOf([author.uid, author.id, author.user_id], asString);
  const handle = firstOf([author.unique_id, author.uniqueId], asString);
  if (!uid || !handle) return null;
  const videoCount = firstOf([author.aweme_count, author.videoCount], asNumber);
  return {
    ref: {
      platformUserId: uid,
      handle: handle.replace(/^@/, ''),
      followers: firstOf([author.follower_count, author.followerCount], asNumber),
      region: firstOf([author.region, extra.region], upperRegion),
      // Search payloads often zero this field; treat 0 as unknown.
      videoCount: videoCount && videoCount > 0 ? videoCount : null,
      lastPostedAt: extra.postedAt,
      matchedQuery,
      avatarSourceUrl: avatarOf(author),
    },
    text: `${extra.text} ${asString(author.nickname) ?? ''} ${asString(author.signature) ?? ''}`,
  };
}

function keepForThailand(hit: Hit, keywordIsThai: boolean): boolean {
  const region = hit.ref.region;
  if (region) return region === 'TH';
  return keywordIsThai || thaiShare(hit.text) >= 0.3;
}

/**
 * A search hit only proves the creator posted *at least* that recently. An old hit would look like inactivity to
 * gate 0a, so report it only when it is within 30 days and leave older ones unknown (enrichment fills the real date).
 */
function recentOrNull(iso: string | null): string | null {
  if (!iso) return null;
  return Date.now() - Date.parse(iso) <= 30 * 86_400_000 ? iso : null;
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function createScrapeCreatorsKolProvider(apiKey: string): KolDataProvider & { client: ScrapeCreatorsClient } {
  const client = new ScrapeCreatorsClient(apiKey);
  // handle → uid/region learned from search and video payloads (saves profile/region calls).
  const known = new Map<string, Known>();
  const remember = (handle: string, uid: string, region: string | null) => {
    const k = handle.toLowerCase();
    const prev = known.get(k);
    known.set(k, { uid, region: region ?? prev?.region ?? null });
  };

  async function keywordHits(keyword: string, pages: number): Promise<Hit[]> {
    const hits: Hit[] = [];
    let cursor: number | null = null;
    for (let page = 0; page < pages; page++) {
      const body = await client.get('/v1/tiktok/search/keyword', {
        query: keyword,
        region: 'TH',
        date_posted: 'last-3-months',
        sort_by: 'relevance',
        cursor,
      });
      if (!body) break;
      const items = asArray(body.search_item_list ?? body.aweme_list ?? body.data);
      for (const item of items) {
        const aweme = unwrapVideo(item);
        const author = asRecord(aweme?.author);
        if (!aweme || !author) continue;
        const hit = hitFromAuthor(
          author,
          { region: upperRegion(aweme.region), postedAt: recentOrNull(postedAtOf(aweme)), text: asString(aweme.desc) ?? '' },
          keyword,
        );
        if (hit) hits.push(hit);
      }
      const next = asNumber(body.cursor);
      if (items.length === 0 || next === null || next === cursor || asBoolean(body.has_more) === false) break;
      cursor = next;
    }
    return hits;
  }

  async function userHits(keyword: string): Promise<Hit[]> {
    const body = await client.get('/v1/tiktok/search/users', { query: keyword });
    if (!body) return [];
    const hits: Hit[] = [];
    for (const row of asArray(body.users ?? body.user_list ?? body.data)) {
      const r = asRecord(row);
      const user = asRecord(r?.user_info) ?? r;
      if (!user) continue;
      const hit = hitFromAuthor(user, { region: null, postedAt: null, text: asString(user.search_user_desc) ?? '' }, keyword);
      if (hit) hits.push(hit);
    }
    return hits;
  }

  async function fetchRegion(handle: string): Promise<string | null> {
    try {
      const body = await client.get('/v1/tiktok/profile/region', { handle });
      return upperRegion(body?.region);
    } catch {
      return null;
    }
  }

  return {
    name: 'scrapecreators',
    mock: false,
    client,

    async searchCreators({ keyword, limit }) {
      const kw = keyword.trim();
      if (!kw) return [];
      const want = Math.max(1, Math.min(100, Math.floor(limit)));
      const [videos, users] = await Promise.allSettled([keywordHits(kw, want > 15 ? 2 : 1), userHits(kw)]);
      if (videos.status === 'rejected' && users.status === 'rejected') throw videos.reason;
      const all = [...(videos.status === 'fulfilled' ? videos.value : []), ...(users.status === 'fulfilled' ? users.value : [])];

      const keywordIsThai = thaiShare(kw) >= 0.5;
      const byId = new Map<string, Hit>();
      for (const hit of all) {
        remember(hit.ref.handle, hit.ref.platformUserId, hit.ref.region);
        const prev = byId.get(hit.ref.platformUserId);
        if (!prev) {
          byId.set(hit.ref.platformUserId, hit);
          continue;
        }
        // Merge duplicates: keep the richest value of every field.
        prev.ref = {
          ...prev.ref,
          followers: prev.ref.followers ?? hit.ref.followers,
          region: prev.ref.region ?? hit.ref.region,
          videoCount: prev.ref.videoCount ?? hit.ref.videoCount,
          lastPostedAt: laterIso(prev.ref.lastPostedAt, hit.ref.lastPostedAt),
          avatarSourceUrl: prev.ref.avatarSourceUrl ?? hit.ref.avatarSourceUrl,
        };
        prev.text = `${prev.text} ${hit.text}`.slice(0, 4_000);
      }

      const kept = [...byId.values()].filter((h) => keepForThailand(h, keywordIsThai));
      // Region-confirmed creators first; otherwise keep the provider's relevance order.
      const ordered = kept
        .map((h, i) => ({ h, i }))
        .sort((a, b) => Number(b.h.ref.region === 'TH') - Number(a.h.ref.region === 'TH') || a.i - b.i)
        .map(({ h }) => h.ref);
      return ordered.slice(0, want);
    },

    async getProfile(handle) {
      const h = handle.trim().replace(/^@/, '');
      if (!h) return null;
      const cached = known.get(h.toLowerCase());
      const body = await client.get('/v1/tiktok/profile', { handle: h });
      if (!body || !asRecord(body.user)) return null;
      const profile = normalizeScrapeCreatorsProfile(body);
      const region = profile.region ?? cached?.region ?? (await fetchRegion(h));
      remember(profile.handle, profile.platformUserId, region);
      return { ...profile, region };
    },

    async getVideos(handle, limit) {
      const h = handle.trim().replace(/^@/, '');
      const want = Math.max(0, Math.min(60, Math.floor(limit)));
      if (!h || want === 0) return [];
      const uid = known.get(h.toLowerCase())?.uid ?? null;
      const byId = new Map<string, CreatorVideo>();
      let cursor: string | null = null;
      let region: string | null = 'TH';

      const fetchPage = (max_cursor: string | null) =>
        client.get('/v3/tiktok/profile/videos', {
          handle: h,
          user_id: uid,
          sort_by: 'latest',
          // Pinned posts are old outliers that would skew "latest N" metrics.
          include_pinned: false,
          region,
          max_cursor,
        });

      for (let page = 0; page < 4 && byId.size < want; page++) {
        let body = await fetchPage(cursor);
        let items = asArray(body?.aweme_list ?? body?.itemList ?? body?.items);
        if (page === 0 && items.length === 0 && body) {
          // The feed source is region-sensitive (defaults to US); retry once with the API default.
          region = null;
          body = await fetchPage(null);
          items = asArray(body?.aweme_list ?? body?.itemList ?? body?.items);
        }
        if (!body) break;
        for (const item of items) {
          try {
            const video = normalizeScrapeCreatorsVideo(item);
            byId.set(video.platformVideoId, video);
            const author = asRecord(get(item, 'author'));
            const authorUid = author ? firstOf([author.uid, author.id], asString) : null;
            if (authorUid) remember(h, authorUid, upperRegion(author?.region));
          } catch {
            // Skip malformed items rather than failing the creator.
          }
        }
        const next = asString(body.max_cursor ?? body.cursor);
        const hasMore = asBoolean(body.has_more ?? body.hasMore);
        if (items.length === 0 || !next || next === cursor || hasMore === false) break;
        cursor = next;
      }

      return [...byId.values()]
        .sort((a, b) => (b.postedAt ? Date.parse(b.postedAt) : 0) - (a.postedAt ? Date.parse(a.postedAt) : 0))
        .slice(0, want);
    },
  };
}
