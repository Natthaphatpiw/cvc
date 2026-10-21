import type { CreatorProfile, CreatorVideo } from '@cvc/schemas';
import { ProviderError } from './errors';
import { MAX_DOC_CHARS } from './firecrawl';
import { median, truncate } from './json';
import type { KolDataProvider, SourceDoc } from './types';

/** Accepts https://www.tiktok.com/@handle[/video/…], tiktok.com/@handle, @handle or a bare handle. */
export function parseTiktokHandle(input: string): string | null {
  const raw = input.trim();
  const fromUrl = raw.match(/tiktok\.com\/@([A-Za-z0-9._]{2,24})/i);
  if (fromUrl?.[1]) return fromUrl[1];
  const bare = raw.replace(/^@/, '');
  return /^[A-Za-z0-9._]{2,24}$/.test(bare) ? bare : null;
}

function erOf(v: CreatorVideo): number | null {
  if (!v.views || v.views <= 0) return null;
  return ((v.likes ?? 0) + (v.comments ?? 0) + (v.shares ?? 0)) / v.views;
}

/** One compact SourceDoc for the client's own TikTok: profile facts, computed stats and recent captions. */
export function buildTiktokDoc(profile: CreatorProfile, videos: CreatorVideo[], opts: { provider: string; mock: boolean }): SourceDoc {
  const views = videos.map((v) => v.views).filter((n): n is number => n !== null);
  const ers = videos.map(erOf).filter((n): n is number => n !== null);
  const times = videos.map((v) => (v.postedAt ? Date.parse(v.postedAt) : NaN)).filter((t) => Number.isFinite(t));
  const spanWeeks = times.length >= 2 ? Math.max(1, (Math.max(...times) - Math.min(...times)) / (7 * 86_400_000)) : null;
  const postsPerWeek = spanWeeks ? Number((videos.length / spanWeeks).toFixed(2)) : null;
  const sponsored = videos.filter((v) => v.isSponsored).length;
  const shop = videos.filter((v) => v.hasShopProduct).length;
  const tagCounts = new Map<string, number>();
  for (const v of videos) for (const t of v.hashtags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const topHashtags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
  const medianViews = median(views);
  const medianEr = median(ers);

  const header = [
    `บัญชี TikTok: @${profile.handle}${profile.displayName ? ` (${profile.displayName})` : ''}`,
    profile.bio ? `ไบโอ: ${profile.bio}` : null,
    profile.followerCount !== null ? `ผู้ติดตาม: ${profile.followerCount}` : null,
    profile.likesCount !== null ? `ยอดไลก์รวม: ${profile.likesCount}` : null,
    profile.videoCount !== null ? `จำนวนวิดีโอ: ${profile.videoCount}` : null,
    profile.isShopSeller ? 'มี TikTok Shop' : null,
    medianViews !== null ? `ค่ามัธยฐานยอดวิว (${views.length} คลิปล่าสุด): ${Math.round(medianViews)}` : null,
    medianEr !== null ? `ค่ามัธยฐาน engagement rate ต่อวิว: ${(medianEr * 100).toFixed(1)}%` : null,
    postsPerWeek !== null ? `ความถี่โพสต์: ${postsPerWeek} คลิป/สัปดาห์` : null,
    sponsored ? `คลิปที่ติดป้ายสปอนเซอร์/paid partnership: ${sponsored}` : null,
    shop ? `คลิปที่ปักตะกร้าสินค้า: ${shop}` : null,
    topHashtags.length ? `แฮชแท็กที่ใช้บ่อย: ${topHashtags.map((t) => `#${t}`).join(' ')}` : null,
  ].filter((l): l is string => l !== null);

  const body = videos.map((v, i) => {
    const stats = [
      v.views !== null ? `views ${v.views}` : null,
      v.likes !== null ? `likes ${v.likes}` : null,
      v.comments !== null ? `comments ${v.comments}` : null,
      v.shares !== null ? `shares ${v.shares}` : null,
      v.isSponsored ? 'sponsored' : null,
      v.hasShopProduct ? 'shop' : null,
    ].filter(Boolean);
    return `[${i + 1}] ${v.postedAt?.slice(0, 10) ?? 'ไม่ทราบวันที่'} · ${stats.join(' · ')}\n  ${truncate((v.caption ?? '').replace(/\s+/g, ' '), 300)}`;
  });

  return {
    sourceType: 'tiktok',
    url: `https://www.tiktok.com/@${profile.handle}`,
    title: `TikTok @${profile.handle}`,
    text: truncate([...header, '', ...body].join('\n'), MAX_DOC_CHARS),
    fetchedAt: new Date().toISOString(),
    meta: {
      provider: opts.provider,
      mock: opts.mock,
      handle: profile.handle,
      followers: profile.followerCount,
      videosAnalyzed: videos.length,
      medianViews,
      medianEr,
      postsPerWeek,
      sponsoredCount: sponsored,
      shopVideoCount: shop,
      topHashtags,
    },
  };
}

export async function tiktokProfileDocs(kol: KolDataProvider, input: string, videoLimit = 20): Promise<SourceDoc[]> {
  const handle = parseTiktokHandle(input);
  if (!handle) {
    throw new ProviderError(`${kol.name}: cannot read a TikTok handle from "${input}"`, {
      provider: kol.name,
      retryable: false,
      code: 'invalid_input',
    });
  }
  const profile = await kol.getProfile(handle);
  if (!profile) return [];
  const videos = await kol.getVideos(profile.handle, videoLimit);
  return [buildTiktokDoc(profile, videos, { provider: kol.name, mock: kol.mock })];
}
