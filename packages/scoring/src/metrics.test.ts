import { REF_SEED } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { computeMetrics } from './metrics';
import { tierFor } from './ref';
import { DAY, NOW, daysAgo, video } from './test-fixtures';

describe('computeMetrics', () => {
  it('computes views-based ER without saves', () => {
    const videos = Array.from({ length: 5 }, (_, i) =>
      video({ platformVideoId: `v${i}`, postedAt: daysAgo(3 + i), views: 1_000, likes: 100, comments: 10, shares: 10, saves: 5_000 }),
    );
    const m = computeMetrics(videos, { now: NOW });
    expect(m.videosAnalyzed).toBe(5);
    expect(m.erViewsMedian).toBe(0.12);
  });

  it('excludes videos younger than 48 hours but still reports them as the last post', () => {
    const fresh = video({ platformVideoId: 'fresh', postedAt: new Date(NOW.getTime() - 10 * 3_600_000).toISOString(), views: 5_000_000 });
    const old = Array.from({ length: 4 }, (_, i) => video({ platformVideoId: `o${i}`, postedAt: daysAgo(3 + i), views: 10_000 }));
    const m = computeMetrics([fresh, ...old], { now: NOW });
    expect(m.videosAnalyzed).toBe(4);
    expect(m.medianViews).toBe(10_000);
    expect(m.lastPostedAt).toBe(fresh.postedAt);
  });

  it('honours minAgeHours and maxVideos', () => {
    const videos = Array.from({ length: 25 }, (_, i) => video({ platformVideoId: `v${i}`, postedAt: new Date(NOW.getTime() - (i + 1) * DAY).toISOString(), views: 1_000 * (i + 1) }));
    expect(computeMetrics(videos, { now: NOW }).videosAnalyzed).toBe(20);
    // With a 0 h minimum age the newest video (1 day old) is included again.
    expect(computeMetrics(videos, { now: NOW, minAgeHours: 0, maxVideos: 5 }).medianViews).toBe(3_000);
  });

  it('splits sponsored and organic posts (flag or #โฆษณา disclosure)', () => {
    const videos = [
      video({ platformVideoId: 's1', postedAt: daysAgo(3), isSponsored: true, views: 20_000, likes: 400, comments: 0, shares: 0 }),
      video({ platformVideoId: 's2', postedAt: daysAgo(4), isSponsored: true, views: 30_000, likes: 600, comments: 0, shares: 0 }),
      video({ platformVideoId: 's3', postedAt: daysAgo(5), isSponsored: null, hashtags: ['โฆษณา'], views: 40_000, likes: 800, comments: 0, shares: 0 }),
      video({ platformVideoId: 'o1', postedAt: daysAgo(6), views: 50_000, likes: 2_500, comments: 0, shares: 0 }),
      video({ platformVideoId: 'o2', postedAt: daysAgo(7), views: 60_000, likes: 3_000, comments: 0, shares: 0 }),
    ];
    const m = computeMetrics(videos, { now: NOW });
    expect(m.sponsoredCount).toBe(3);
    expect(m.sponsoredShare).toBe(0.6);
    expect(m.medianViewsSponsored).toBe(30_000);
    expect(m.medianViewsOrganic).toBe(55_000);
    expect(m.erSponsored).toBe(0.02);
    expect(m.erOrganic).toBe(0.05);
    expect(m.medianViews).toBe(40_000);
  });

  it('derives cadence, growth and best posting slots (Asia/Bangkok, Mon=0)', () => {
    // 2026-10-21 is a Wednesday. 12:00 UTC = 19:00 in Bangkok.
    const at = (d: number, utcHour: number) => new Date(Date.UTC(2026, 9, 21 - d, utcHour)).toISOString();
    const videos = [
      video({ platformVideoId: 'a', postedAt: at(7, 12), views: 90_000 }), // Wed 19:00
      video({ platformVideoId: 'b', postedAt: at(14, 12), views: 80_000 }), // Wed 19:00
      video({ platformVideoId: 'c', postedAt: at(5, 2), views: 5_000 }), // Fri 09:00
      video({ platformVideoId: 'd', postedAt: at(12, 2), views: 6_000 }), // Fri 09:00
      video({ platformVideoId: 'e', postedAt: at(9, 5), views: 20_000 }), // Mon 12:00
      video({ platformVideoId: 'f', postedAt: at(16, 5), views: 25_000 }), // Mon 12:00
    ];
    const m = computeMetrics(videos, { now: NOW, followerCount: 110_000, followers30dAgo: 100_000 });
    expect(m.bestDays).toEqual([0, 2]);
    expect(m.bestHours).toEqual([12, 19]);
    expect(m.followerGrowth30d).toBeCloseTo(Math.log(1.1), 4);
    // newest Fri 02:00 UTC (day 5) … oldest Mon 05:00 UTC (day 16): 10.875 days for 5 intervals
    expect(m.postsPerWeek).toBeCloseTo((5 / 10.875) * 7, 2);

    const few = computeMetrics(videos.slice(0, 5), { now: NOW });
    expect(few.bestDays).toEqual([]);
    expect(few.bestHours).toEqual([]);
  });

  it('handles an empty history', () => {
    const m = computeMetrics([], { now: NOW });
    expect(m.videosAnalyzed).toBe(0);
    expect(m.medianViews).toBeNull();
    expect(m.erViewsMedian).toBeNull();
    expect(m.sponsoredShare).toBeNull();
    expect(m.lastPostedAt).toBeNull();
  });
});

describe('tierFor', () => {
  it('maps follower counts onto the tier bands', () => {
    expect(tierFor(5_000, REF_SEED.tierBands)).toBe('nano');
    expect(tierFor(85_000, REF_SEED.tierBands)).toBe('micro');
    expect(tierFor(100_000, REF_SEED.tierBands)).toBe('mid');
    expect(tierFor(2_000_000, REF_SEED.tierBands)).toBe('mega');
    expect(tierFor(500, REF_SEED.tierBands)).toBeNull();
    expect(tierFor(null, REF_SEED.tierBands)).toBeNull();
  });
});
