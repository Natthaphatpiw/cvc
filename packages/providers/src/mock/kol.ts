import { REF_SEED, type CandidateRef, type CreatorProfile, type CreatorVideo, type Tier } from '@cvc/schemas';
import type { KolDataProvider } from '../types';
import { createRng, hashString, type Rng } from './prng';
import {
  CATEGORY_CONTENT,
  FICTIONAL_BRANDS,
  GENERIC_HASHTAGS,
  MOCK_HANDLE_PREFIX,
  MOCK_NAME_SUFFIX,
  ROSTER,
  SPONSORED_CAPTIONS,
  type RosterEntry,
} from './roster';

export const MOCK_VIDEOS_PER_CREATOR = 20;
const DAY_MS = 86_400_000;
const BKK_OFFSET_H = 7;

/** Upper bound used for sampling the open-ended mega band. */
const MEGA_CAP = 4_500_000;

const SPONSORED_RANGE: Record<Tier, [number, number]> = {
  nano: [0, 2],
  micro: [0, 3],
  mid: [1, 4],
  macro: [2, 5],
  mega: [2, 5],
};
const TOTAL_VIDEOS_RANGE: Record<Tier, [number, number]> = {
  nano: [40, 220],
  micro: [80, 500],
  mid: [200, 900],
  macro: [400, 1_500],
  mega: [700, 3_000],
};
/** Typical posting hours in Bangkok time with relative weights. */
const HOUR_WEIGHTS: [number, number][] = [
  [7, 1], [8, 1], [9, 1], [10, 1], [11, 2], [12, 3], [13, 2], [14, 1], [15, 1], [16, 2],
  [17, 3], [18, 4], [19, 5], [20, 5], [21, 4], [22, 3], [23, 1],
];

type MockCreator = { entry: RosterEntry; profile: CreatorProfile; videos: CreatorVideo[] };

function benchmark(tier: Tier, metric: 'median_views' | 'er_views'): { p25: number; p50: number; p75: number } {
  const row = REF_SEED.tierBenchmarks.find((b) => b.tier === tier && b.metric === metric && b.categoryId === null);
  if (!row) throw new Error(`REF_SEED has no ${metric} benchmark for ${tier}`);
  return row;
}

function band(tier: Tier): { min: number; max: number } {
  const row = REF_SEED.tierBands.find((b) => b.tier === tier);
  if (!row) throw new Error(`REF_SEED has no tier band for ${tier}`);
  return { min: row.minFollowers, max: row.maxFollowers ?? MEGA_CAP };
}

/** Log-normal draw centred on p50 whose IQR matches p25..p75, shifted by z0 standard deviations. */
function drawFromQuartiles(rng: Rng, q: { p25: number; p50: number; p75: number }, z0: number, spread = 1): number {
  const sigma = (Math.log(q.p75) - Math.log(q.p25)) / 1.349;
  return Math.exp(Math.log(q.p50) + (z0 + rng.normal() * spread) * sigma);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function weightedHour(rng: Rng): number {
  const total = HOUR_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [h, w] of HOUR_WEIGHTS) {
    r -= w;
    if (r < 0) return h;
  }
  return 20;
}

function fill(template: string, vars: { item: string; p: string; brand?: string }): string {
  return template.replaceAll('{item}', vars.item).replaceAll('{p}', vars.p).replaceAll('{brand}', vars.brand ?? '');
}

/** Bangkok calendar date (y, m, d) of an instant. */
function bangkokDate(now: Date): { y: number; m: number; d: number } {
  const shifted = new Date(now.getTime() + BKK_OFFSET_H * 3_600_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

function buildCreator(seed: string, entry: RosterEntry, index: number, now: Date): MockCreator {
  const rng = createRng(`${seed}::${entry.slug}`);
  const content = CATEGORY_CONTENT[entry.category];
  const handle = `${MOCK_HANDLE_PREFIX}${entry.slug}`;
  const platformUserId = `cvcdemo-${String(index + 1).padStart(3, '0')}`;

  // Followers: log-uniform inside the tier band (nano starts a little above the floor).
  const { min, max } = band(entry.tier);
  const lo = entry.tier === 'nano' ? min * 1.3 : min;
  const pos = rng.next();
  const followers = Math.round(Math.exp(Math.log(lo) + pos * (Math.log(max) - Math.log(lo))));

  // Views and ER follow REF_SEED benchmarks; bigger accounts inside a band skew to higher views.
  const viewsQ = benchmark(entry.tier, 'median_views');
  const medianViews = clamp(drawFromQuartiles(rng, viewsQ, (pos - 0.5) * 1.2, 0.6), viewsQ.p25 * 0.6, viewsQ.p75 * 1.8);
  const erQ = benchmark(entry.tier, 'er_views');
  const er = clamp(drawFromQuartiles(rng, erQ, 0, 0.8), 0.012, 0.11);

  const postsPerWeek = rng.float(1.6, 5);
  // A few creators have gone quiet recently; everyone's 20 posts fit inside ~90 days.
  const lastGapDays = rng.chance(0.1) ? rng.int(9, 20) : rng.int(2, 5);
  const windowDays = clamp(Math.round((MOCK_VIDEOS_PER_CREATOR / postsPerWeek) * 7), 28, 84 - lastGapDays);
  const bestDays = rng.shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, 2);
  const bestStart = rng.pick([12, 18, 19, 20, 21]);
  const bestHours = [bestStart, bestStart + 1];

  const [spMin, spMax] = SPONSORED_RANGE[entry.tier];
  const sponsoredCount = rng.int(spMin, spMax);
  const shopCount = content.shopFriendly ? rng.int(0, entry.tier === 'nano' ? 2 : 6) : rng.chance(0.15) ? 1 : 0;
  const isShopSeller = content.shopFriendly && shopCount > 0 && rng.chance(0.5);
  const isVerified = entry.tier === 'mega' || (entry.tier === 'macro' && rng.chance(0.6)) || (entry.tier === 'mid' && rng.chance(0.15));
  const [tvMin, tvMax] = TOTAL_VIDEOS_RANGE[entry.tier];
  const totalVideos = rng.int(tvMin, tvMax);

  const order = rng.shuffle(Array.from({ length: MOCK_VIDEOS_PER_CREATOR }, (_, i) => i));
  const sponsoredIdx = new Set(order.slice(0, sponsoredCount));
  // Shop links favour sponsored posts, then any other post.
  const shopIdx = new Set([...order.slice(0, sponsoredCount).filter(() => rng.chance(0.6)), ...order.slice(sponsoredCount)].slice(0, shopCount));

  const { y, m, d } = bangkokDate(now);
  const videos: CreatorVideo[] = [];
  let prevOffset = lastGapDays - 1;
  for (let i = 0; i < MOCK_VIDEOS_PER_CREATOR; i++) {
    let offset = Math.max(prevOffset + 1, Math.round(lastGapDays + (i * windowDays) / (MOCK_VIDEOS_PER_CREATOR - 1) + rng.float(-1.2, 1.2)));
    let weekday = (new Date(Date.UTC(y, m, d - offset)).getUTCDay() + 6) % 7; // Mon=0
    if (!bestDays.includes(weekday) && rng.chance(0.45)) {
      // Nudge the post back onto a preferred weekday (only backwards, so order is preserved).
      const target = bestDays.map((bd) => (weekday - bd + 7) % 7).sort((a, b) => a - b)[0] ?? 0;
      if (target <= 3) {
        offset += target;
        weekday = (new Date(Date.UTC(y, m, d - offset)).getUTCDay() + 6) % 7;
      }
    }
    prevOffset = offset;
    const slotDay = bestDays.includes(weekday);
    const hour = slotDay && rng.chance(0.7) ? rng.pick(bestHours) : weightedHour(rng);
    const minute = rng.int(0, 59);
    const postedAt = new Date(Date.UTC(y, m, d - offset, hour - BKK_OFFSET_H, minute)).toISOString();
    const inSlot = slotDay && bestHours.includes(hour);

    const sponsored = sponsoredIdx.has(i);
    const slotFactor = inSlot ? 1.45 : slotDay || bestHours.includes(hour) ? 1.05 : 0.85;
    const viral = rng.chance(0.05) ? rng.float(3, 7) : 1;
    const views = Math.max(
      50,
      Math.round(medianViews * slotFactor * (sponsored ? rng.float(0.65, 0.95) : 1) * Math.exp(rng.normal() * 0.45) * viral),
    );
    const erVideo = er * Math.exp(rng.normal() * 0.22) * (sponsored ? 0.85 : 1);
    const engagements = views * erVideo;
    const likes = Math.round(engagements * rng.float(0.84, 0.9));
    const comments = Math.round(engagements * rng.float(0.03, 0.07));
    const shares = Math.round(engagements * rng.float(0.05, 0.1));
    const saves = Math.round(likes * rng.float(content.saveRate[0], content.saveRate[1]));

    const item = rng.pick(content.items);
    const tags = rng.shuffle(content.hashtags).slice(0, rng.int(2, 3));
    let text: string;
    if (sponsored) {
      const brand = `แบรนด์${rng.pick(FICTIONAL_BRANDS)} (สมมติ)`;
      text = fill(rng.pick(SPONSORED_CAPTIONS), { item, p: entry.particle, brand });
      tags.unshift(rng.chance(0.5) ? 'ad' : 'sponsored');
    } else {
      text = fill(rng.pick(content.captions), { item, p: entry.particle });
    }
    if (rng.chance(0.5)) tags.push(rng.pick(GENERIC_HASHTAGS));
    const platformVideoId = `${platformUserId}-v${String(i + 1).padStart(2, '0')}`;

    videos.push({
      platformVideoId,
      url: `https://www.tiktok.com/@${handle}/video/${platformVideoId}`,
      postedAt,
      caption: `${text} ${tags.map((t) => `#${t}`).join(' ')}`,
      hashtags: tags,
      durationS: rng.int(content.durationS[0], content.durationS[1]),
      views,
      likes,
      comments,
      shares,
      saves,
      isSponsored: sponsored,
      isAd: sponsored && (entry.tier === 'macro' || entry.tier === 'mega') && rng.chance(0.3),
      hasShopProduct: shopIdx.has(i),
      locationCreated: 'TH',
      textLanguage: 'th',
      coverSourceUrl: null,
    });
  }
  videos.sort((a, b) => Date.parse(b.postedAt ?? '') - Date.parse(a.postedAt ?? ''));

  const profile: CreatorProfile = {
    platform: 'tiktok',
    platformUserId,
    handle,
    displayName: `${entry.nameTh}${MOCK_NAME_SUFFIX}`,
    bio: `${content.bioTh} · บัญชีสมมติสำหรับสาธิตระบบ`,
    bioLink: null,
    avatarSourceUrl: null,
    isVerified,
    region: 'TH',
    language: 'th',
    isShopSeller,
    isCommerceUser: shopCount > 0 || sponsoredCount > 0,
    followerCount: followers,
    followingCount: rng.int(40, 900),
    likesCount: Math.round(totalVideos * medianViews * er * 0.87 * rng.float(0.8, 1.3)),
    videoCount: totalVideos,
  };
  return { entry, profile, videos };
}

const wordSegmenter = new Intl.Segmenter('th', { granularity: 'word' });

function keywordWords(kw: string): Set<string> {
  const words = new Set<string>();
  for (const part of kw.split(/[\s,/#|+]+/)) {
    if (!part) continue;
    words.add(part);
    for (const seg of wordSegmenter.segment(part)) if (seg.isWordLike) words.add(seg.segment);
  }
  return words;
}

/**
 * Thai has no spaces, so plain substring matching gives false hits ('กิน' inside 'สกินแคร์').
 * Short terms must equal a segmented word; terms of 4+ characters may also appear as substrings.
 */
function termMatches(kw: string, words: Set<string>, term: string): boolean {
  const t = term.toLowerCase();
  if (words.has(t)) return true;
  if (t.length >= 4 && kw.includes(t)) return true;
  return kw.length >= 4 && t.includes(kw);
}

function relevance(kw: string, words: Set<string>, entry: RosterEntry): number {
  const c = CATEGORY_CONTENT[entry.category];
  const hits = c.keywords.filter((t) => termMatches(kw, words, t)).length;
  const soft = [...c.hashtags, ...c.items, ...entry.slug.split('_')].filter((t) => termMatches(kw, words, t)).length;
  if (hits === 0 && soft === 0) return 0;
  return 1 + Math.min(hits, 4) * 0.5 + Math.min(soft, 2) * 0.25;
}

export type MockKolProviderOptions = {
  /** Anchor for "last ~90 days". Defaults to the current Bangkok day, so output is stable within a day. */
  now?: Date;
};

export function createMockKolProvider(seed: string, opts: MockKolProviderOptions = {}): KolDataProvider {
  let cache: { key: string; creators: MockCreator[]; byHandle: Map<string, MockCreator> } | null = null;

  const pool = () => {
    const anchor = opts.now ?? new Date();
    const { y, m, d } = bangkokDate(anchor);
    const key = opts.now ? String(opts.now.getTime()) : `${y}-${m}-${d}`;
    if (!cache || cache.key !== key) {
      const creators = ROSTER.map((entry, i) => buildCreator(seed, entry, i, anchor));
      cache = { key, creators, byHandle: new Map(creators.map((c) => [c.profile.handle, c])) };
    }
    return cache;
  };

  const toRef = (c: MockCreator, matchedQuery: string): CandidateRef => ({
    platformUserId: c.profile.platformUserId,
    handle: c.profile.handle,
    followers: c.profile.followerCount,
    region: 'TH',
    videoCount: c.profile.videoCount,
    lastPostedAt: c.videos[0]?.postedAt ?? null,
    matchedQuery,
    avatarSourceUrl: null,
  });

  const findCreator = (handle: string) => pool().byHandle.get(handle.trim().replace(/^@/, '').toLowerCase()) ?? null;

  return {
    name: 'mock',
    mock: true,

    async searchCreators({ keyword, limit }) {
      const want = Math.max(0, Math.floor(limit));
      if (want === 0) return [];
      const kw = keyword.trim().toLowerCase();
      const words = keywordWords(kw);
      const jitter = (c: MockCreator) => hashString(`${seed}|${kw}|${c.profile.handle}`) / 4_294_967_296;
      const scored = pool().creators.map((c) => ({ c, score: kw ? relevance(kw, words, c.entry) : 0, j: jitter(c) }));

      const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score + b.j * 0.3 - (a.score + a.j * 0.3));
      // Real search returns some off-topic accounts too; keep a few so gates and the evaluator have work to do.
      const others = scored.filter((s) => s.score === 0).sort((a, b) => b.j - a.j);
      const noise = others.slice(0, matched.length > 0 ? Math.min(3, Math.ceil(matched.length / 3)) : 12);
      return [...matched, ...noise].slice(0, want).map((s) => toRef(s.c, keyword));
    },

    async getProfile(handle) {
      const c = findCreator(handle);
      return c ? { ...c.profile } : null;
    },

    async getVideos(handle, limit) {
      const c = findCreator(handle);
      if (!c) return [];
      return c.videos.slice(0, Math.max(0, Math.floor(limit))).map((v) => ({ ...v, hashtags: [...v.hashtags] }));
    },
  };
}
