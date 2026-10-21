import type { CreatorMetrics, CreatorVideo } from '@cvc/schemas';
import { isNum, mean, median, quantile, round, stdev } from './stats';
import { bangkokDayHour } from './text';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const SPONSOR_TAGS = new Set(['ad', 'ads', 'sponsored', 'spon', 'paidpartnership', 'โฆษณา']);

function tagsOf(v: CreatorVideo): string[] {
  const fromCaption = v.caption ? [...v.caption.matchAll(/#([^\s#]+)/gu)].map((m) => m[1] ?? '') : [];
  return [...v.hashtags, ...fromCaption].map((t) => t.replace(/^#/, '').toLowerCase());
}

/** Sponsored = platform flag (isSponsored / isAd) or a disclosure hashtag (#ad, #โฆษณา …). */
export function isSponsoredVideo(v: CreatorVideo): boolean {
  if (v.isSponsored === true || v.isAd === true) return true;
  return tagsOf(v).some((t) => SPONSOR_TAGS.has(t));
}

function postedMs(v: CreatorVideo): number | null {
  if (!v.postedAt) return null;
  const t = Date.parse(v.postedAt);
  return Number.isNaN(t) ? null : t;
}

/** Views-based ER without saves: (likes + comments + shares) / views. null when nothing to count. */
export function videoEr(v: CreatorVideo): number | null {
  if (!isNum(v.views) || v.views <= 0) return null;
  if (v.likes === null && v.comments === null && v.shares === null) return null;
  return ((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0)) / v.views;
}

const roundOrNull = (x: number | null, digits: number): number | null => (x === null ? null : round(x, digits));

/** Days and hours (Asia/Bangkok) whose median views beat the creator's overall median, n ≥ 2 per bucket. */
function bestSlots(dated: { ms: number; views: number }[], overallMedian: number): { bestDays: number[]; bestHours: number[] } {
  if (dated.length < 6) return { bestDays: [], bestHours: [] };
  const byDay = new Map<number, number[]>();
  const byHour = new Map<number, number[]>();
  for (const d of dated) {
    const { weekday, hour } = bangkokDayHour(new Date(d.ms));
    byDay.set(weekday, [...(byDay.get(weekday) ?? []), d.views]);
    byHour.set(hour, [...(byHour.get(hour) ?? []), d.views]);
  }
  const pick = (m: Map<number, number[]>, k: number): number[] => {
    const ranked = [...m.entries()]
      .filter(([, vs]) => vs.length >= 2)
      .map(([key, vs]) => ({ key, med: median(vs) ?? 0 }))
      .sort((a, b) => b.med - a.med || a.key - b.key);
    const above = ranked.filter((r) => r.med >= overallMedian).slice(0, k);
    const chosen = above.length > 0 ? above : ranked.slice(0, 1);
    return chosen.map((r) => r.key).sort((a, b) => a - b);
  };
  return { bestDays: pick(byDay, 2), bestHours: pick(byHour, 3) };
}

/**
 * §6.3 metrics over the most recent `maxVideos` (20) videos older than `minAgeHours` (48 h). ER excludes saves.
 * `viewsCv` is the coefficient of variation of log10(views) (consistency input). Videos without a date are kept
 * (age unknown) but are not used for cadence or best posting slots. `now` defaults to the current time; pass it for
 * reproducible results.
 */
export function computeMetrics(
  videos: CreatorVideo[],
  opts?: { now?: Date; maxVideos?: number; minAgeHours?: number; followerCount?: number | null; followers30dAgo?: number | null },
): CreatorMetrics {
  const now = (opts?.now ?? new Date()).getTime();
  const maxVideos = opts?.maxVideos ?? 20;
  const minAgeMs = (opts?.minAgeHours ?? 48) * HOUR_MS;

  const withTime = videos.map((v) => ({ v, ms: postedMs(v) }));
  const byRecency = [...withTime].sort((a, b) => (b.ms ?? -Infinity) - (a.ms ?? -Infinity));

  const datedAll = byRecency.filter((x): x is { v: CreatorVideo; ms: number } => x.ms !== null);
  const lastMs = datedAll[0]?.ms ?? null;

  // Posting cadence uses every dated post (fresh ones count as posts).
  const cadence = datedAll.slice(0, maxVideos);
  let postsPerWeek: number | null = null;
  if (cadence.length >= 2) {
    const spanDays = ((cadence[0]?.ms ?? 0) - (cadence[cadence.length - 1]?.ms ?? 0)) / DAY_MS;
    if (spanDays >= 1) postsPerWeek = round(((cadence.length - 1) / spanDays) * 7, 2);
  }

  const eligible = byRecency
    .filter((x) => isNum(x.v.views) && (x.v.views as number) > 0)
    .filter((x) => x.ms === null || now - x.ms >= minAgeMs)
    .slice(0, maxVideos);

  const views = eligible.map((x) => x.v.views as number);
  const ers = eligible.map((x) => videoEr(x.v)).filter(isNum);

  const sponsored = eligible.filter((x) => isSponsoredVideo(x.v));
  const organic = eligible.filter((x) => !isSponsoredVideo(x.v));
  const erOf = (xs: typeof eligible) => median(xs.map((x) => videoEr(x.v)).filter(isNum));
  const viewsOf = (xs: typeof eligible) => median(xs.map((x) => x.v.views as number));

  let viewsCv: number | null = null;
  if (views.length >= 3) {
    const logs = views.map((v) => Math.log10(v));
    const m = mean(logs);
    const s = stdev(logs);
    if (m !== null && s !== null && m > 0) viewsCv = round(s / m, 4);
  }

  const medianViews = median(views);
  const datedEligible = eligible.filter((x): x is { v: CreatorVideo; ms: number } => x.ms !== null);
  const slots = bestSlots(
    datedEligible.map((x) => ({ ms: x.ms, views: x.v.views as number })),
    medianViews ?? 0,
  );

  const fc = opts?.followerCount ?? null;
  const f30 = opts?.followers30dAgo ?? null;
  const followerGrowth30d = isNum(fc) && isNum(f30) && fc > 0 && f30 > 0 ? round(Math.log(fc / f30), 4) : null;

  return {
    videosAnalyzed: eligible.length,
    medianViews: roundOrNull(medianViews, 0),
    p25Views: roundOrNull(quantile(views, 0.25), 0),
    p75Views: roundOrNull(quantile(views, 0.75), 0),
    erViewsMedian: roundOrNull(median(ers), 5),
    postsPerWeek,
    viewsCv,
    lastPostedAt: lastMs === null ? null : new Date(lastMs).toISOString(),
    sponsoredCount: sponsored.length,
    sponsoredShare: eligible.length > 0 ? round(sponsored.length / eligible.length, 4) : null,
    erSponsored: roundOrNull(erOf(sponsored), 5),
    erOrganic: roundOrNull(erOf(organic), 5),
    medianViewsSponsored: roundOrNull(viewsOf(sponsored), 0),
    medianViewsOrganic: roundOrNull(viewsOf(organic), 0),
    followerGrowth30d,
    bestDays: slots.bestDays,
    bestHours: slots.bestHours,
  };
}
