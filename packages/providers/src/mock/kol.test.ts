import { REF_SEED, CandidateRef, CreatorProfile, CreatorVideo } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { createMockKolProvider, MOCK_VIDEOS_PER_CREATOR } from './kol';
import { MOCK_HANDLE_PREFIX, MOCK_NAME_SUFFIX, ROSTER } from './roster';

const NOW = new Date('2026-10-21T05:00:00.000Z');
const handles = ROSTER.map((r) => `${MOCK_HANDLE_PREFIX}${r.slug}`);

async function snapshot(seed: string) {
  const p = createMockKolProvider(seed, { now: NOW });
  const profiles = await Promise.all(handles.map((h) => p.getProfile(h)));
  const videos = await Promise.all(handles.map((h) => p.getVideos(h, 50)));
  const search = await p.searchCreators({ keyword: 'สกินแคร์', limit: 15 });
  return { profiles, videos, search };
}

describe('createMockKolProvider', () => {
  it('is marked as mock', () => {
    const p = createMockKolProvider('t');
    expect(p.mock).toBe(true);
    expect(p.name).toBe('mock');
  });

  it('is deterministic per seed and differs across seeds', async () => {
    const a = await snapshot('seed-a');
    const b = await snapshot('seed-a');
    const c = await snapshot('seed-b');
    expect(b).toEqual(a);
    expect(c.profiles.map((x) => x?.followerCount)).not.toEqual(a.profiles.map((x) => x?.followerCount));
    // Default `now` (current Bangkok day) is stable too.
    const d1 = await createMockKolProvider('seed-a').getVideos(handles[0] ?? '', 20);
    const d2 = await createMockKolProvider('seed-a').getVideos(handles[0] ?? '', 20);
    expect(d2).toEqual(d1);
  });

  it('has ~40 fictional Thai creators with null avatars', async () => {
    const p = createMockKolProvider('demo', { now: NOW });
    expect(ROSTER.length).toBe(40);
    expect(new Set(handles).size).toBe(40);
    for (const h of handles) {
      const profile = await p.getProfile(`@${h.toUpperCase()}`);
      expect(profile).not.toBeNull();
      const prof = CreatorProfile.parse(profile);
      expect(prof.handle.startsWith(MOCK_HANDLE_PREFIX)).toBe(true);
      expect(prof.displayName?.endsWith(MOCK_NAME_SUFFIX)).toBe(true);
      expect(prof.avatarSourceUrl).toBeNull();
      expect(prof.bioLink).toBeNull();
      expect(prof.region).toBe('TH');
      expect(prof.language).toBe('th');
    }
    expect(await p.getProfile('real_creator')).toBeNull();
    expect(await p.getVideos('real_creator', 20)).toEqual([]);
  });

  it('keeps followers inside the tier band and views/ER near the tier benchmarks', async () => {
    const p = createMockKolProvider('demo', { now: NOW });
    for (const entry of ROSTER) {
      const prof = await p.getProfile(`${MOCK_HANDLE_PREFIX}${entry.slug}`);
      const band = REF_SEED.tierBands.find((b) => b.tier === entry.tier);
      expect(band).toBeDefined();
      const followers = prof?.followerCount ?? -1;
      expect(followers).toBeGreaterThanOrEqual(band?.minFollowers ?? 0);
      if (band?.maxFollowers != null) expect(followers).toBeLessThanOrEqual(band.maxFollowers);

      const videos = await p.getVideos(`${MOCK_HANDLE_PREFIX}${entry.slug}`, 20);
      const views = videos.map((v) => v.views ?? 0).sort((a, b) => a - b);
      const medianViews = ((views[9] ?? 0) + (views[10] ?? 0)) / 2;
      const bench = REF_SEED.tierBenchmarks.find((b) => b.tier === entry.tier && b.metric === 'median_views');
      expect(medianViews).toBeGreaterThan((bench?.p25 ?? 0) * 0.25);
      expect(medianViews).toBeLessThan((bench?.p75 ?? Infinity) * 3);
      for (const v of videos) {
        const er = ((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0)) / (v.views ?? 1);
        expect(er).toBeGreaterThan(0.003);
        expect(er).toBeLessThan(0.3);
      }
    }
  });

  it('returns 20 dated Thai videos per creator over the last ~90 days', async () => {
    const p = createMockKolProvider('demo', { now: NOW });
    const ids = new Set<string>();
    for (const h of handles) {
      const videos = await p.getVideos(h, 100);
      expect(videos).toHaveLength(MOCK_VIDEOS_PER_CREATOR);
      expect(await p.getVideos(h, 5)).toHaveLength(5);
      let prev = Infinity;
      const weekdays = new Set<number>();
      const hours = new Set<number>();
      for (const raw of videos) {
        const v = CreatorVideo.parse(raw);
        ids.add(v.platformVideoId);
        const t = Date.parse(v.postedAt ?? '');
        expect(t).toBeLessThan(NOW.getTime());
        expect(NOW.getTime() - t).toBeLessThan(100 * 86_400_000);
        expect(t).toBeLessThan(prev);
        prev = t;
        const bkk = new Date(t + 7 * 3_600_000);
        weekdays.add(bkk.getUTCDay());
        hours.add(bkk.getUTCHours());
        expect(v.coverSourceUrl).toBeNull();
        expect(v.locationCreated).toBe('TH');
        expect(v.textLanguage).toBe('th');
        expect(v.caption).toMatch(/[฀-๿]/);
        expect(v.hashtags.length).toBeGreaterThan(0);
        expect(v.views).toBeGreaterThan(0);
        expect(v.saves).not.toBeNull();
      }
      expect(weekdays.size).toBeGreaterThanOrEqual(3);
      expect(hours.size).toBeGreaterThanOrEqual(4);
      const sponsored = videos.filter((v) => v.isSponsored).length;
      expect(sponsored).toBeGreaterThanOrEqual(0);
      expect(sponsored).toBeLessThanOrEqual(5);
      for (const v of videos.filter((x) => x.isSponsored)) expect(v.caption).toContain('(สมมติ)');
    }
    expect(ids.size).toBe(handles.length * MOCK_VIDEOS_PER_CREATOR);
    const all = await Promise.all(handles.map((h) => p.getVideos(h, 20)));
    expect(all.flat().some((v) => v.isSponsored)).toBe(true);
    expect(all.flat().some((v) => v.hasShopProduct)).toBe(true);
  });

  it('returns keyword-dependent, deterministic search results', async () => {
    const p = createMockKolProvider('demo', { now: NOW });
    const skin = await p.searchCreators({ keyword: 'สกินแคร์', limit: 10 });
    const game = await p.searchCreators({ keyword: 'เกมมือถือ', limit: 10 });
    expect(skin.length).toBeGreaterThan(3);
    expect(skin.length).toBeLessThanOrEqual(10);
    expect(skin.map((c) => c.handle)).not.toEqual(game.map((c) => c.handle));
    expect(skin[0]?.handle).toMatch(/skin|glow|sunscreen|makeup|lipstick/);
    expect(game[0]?.handle).toMatch(/game/);
    // 'กิน' (eat) inside 'สกินแคร์' must not pull food creators to the top.
    expect(skin.slice(0, 5).some((c) => /food|buffet|cafe/.test(c.handle))).toBe(false);
    expect(await p.searchCreators({ keyword: 'สกินแคร์', limit: 10 })).toEqual(skin);

    for (const c of [...skin, ...game]) {
      const ref = CandidateRef.parse(c);
      expect(ref.avatarSourceUrl).toBeNull();
      expect(ref.region).toBe('TH');
      expect(ref.handle.startsWith(MOCK_HANDLE_PREFIX)).toBe(true);
      expect(ref.lastPostedAt).not.toBeNull();
    }
    expect(skin.every((c) => c.matchedQuery === 'สกินแคร์')).toBe(true);
    expect(new Set(skin.map((c) => c.platformUserId)).size).toBe(skin.length);

    const unknown = await p.searchCreators({ keyword: 'zzqx', limit: 8 });
    expect(unknown).toHaveLength(8);
    expect(await p.searchCreators({ keyword: 'สกินแคร์', limit: 0 })).toEqual([]);
  });
});
