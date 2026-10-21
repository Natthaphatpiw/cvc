import { CreatorProfile, CreatorVideo } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { ProviderError } from './errors';
import { normalizeScrapeCreatorsProfile, normalizeScrapeCreatorsVideo } from './scrapecreators';
import { parseTiktokHandle } from './tiktok-intel';

// Shapes follow the examples in ScrapeCreators' OpenAPI spec; values are made up.
const profileBody = {
  success: true,
  user: {
    id: '1234567890',
    uniqueId: 'sample_handle',
    nickname: 'ร้านตัวอย่าง',
    avatarLarger: 'https://cdn.example.com/a_1080.jpeg',
    avatarThumb: 'https://cdn.example.com/a_100.jpeg',
    signature: 'รีวิวสกินแคร์ตามจริง',
    verified: false,
    bioLink: { link: 'https://example.com', risk: 0 },
    commerceUserInfo: { commerceUser: true },
    ttSeller: false,
    language: 'en',
  },
  stats: { followerCount: 41000, followingCount: 74, heart: 900000, heartCount: 900000, videoCount: 210 },
};

const aweme = {
  aweme_id: '7517114944362499342',
  desc: 'ลองกันแดดตัวใหม่ #สกินแคร์ #กันแดด',
  desc_language: 'th',
  region: 'TH',
  create_time: 1750214725,
  statistics: { play_count: 55925, digg_count: 3605, comment_count: 87, share_count: 124, collect_count: 365 },
  video: { duration: 33675, cover: { url_list: ['https://cdn.example.com/cover.jpeg'] } },
  author: { uid: '1234567890', unique_id: 'sample_handle', region: 'TH' },
  text_extra: [{ hashtag_name: 'สกินแคร์', type: 1 }, { hashtag_name: 'กันแดด', type: 1 }],
  is_ad: false,
  is_paid_partnership: true,
  shop_product_url: 'https://www.tiktok.com/shop/pdp/1',
  url: 'https://www.tiktok.com/@sample_handle/video/7517114944362499342',
};

describe('ScrapeCreators normalizers', () => {
  it('maps the profile endpoint body', () => {
    const p = CreatorProfile.parse(normalizeScrapeCreatorsProfile(profileBody));
    expect(p.platformUserId).toBe('1234567890');
    expect(p.handle).toBe('sample_handle');
    expect(p.avatarSourceUrl).toBe('https://cdn.example.com/a_1080.jpeg');
    expect(p.bioLink).toBe('https://example.com');
    expect(p.followerCount).toBe(41000);
    expect(p.likesCount).toBe(900000);
    expect(p.videoCount).toBe(210);
    expect(p.isCommerceUser).toBe(true);
    expect(p.isShopSeller).toBe(false);
    expect(p.language).toBe('th');
    expect(p.region).toBeNull();
  });

  it('maps an aweme author (snake_case) as a profile', () => {
    const p = normalizeScrapeCreatorsProfile({ ...aweme.author, nickname: 'x', follower_count: 12, aweme_count: 3 });
    expect(p.region).toBe('TH');
    expect(p.followerCount).toBe(12);
    expect(p.videoCount).toBe(3);
  });

  it('maps an app-shaped video and a wrapped search row', () => {
    for (const raw of [aweme, { aweme_info: aweme }]) {
      const v = CreatorVideo.parse(normalizeScrapeCreatorsVideo(raw));
      expect(v.platformVideoId).toBe('7517114944362499342');
      expect(v.postedAt).toBe(new Date(1750214725 * 1000).toISOString());
      expect(v.durationS).toBe(34);
      expect(v.views).toBe(55925);
      expect(v.saves).toBe(365);
      expect(v.hashtags).toEqual(['สกินแคร์', 'กันแดด']);
      expect(v.isSponsored).toBe(true);
      expect(v.isAd).toBe(false);
      expect(v.hasShopProduct).toBe(true);
      expect(v.locationCreated).toBe('TH');
      expect(v.textLanguage).toBe('th');
      expect(v.coverSourceUrl).toBe('https://cdn.example.com/cover.jpeg');
    }
  });

  it('leaves unknown flags null and rejects payloads without ids', () => {
    const v = normalizeScrapeCreatorsVideo({ id: '1', desc: 'hello #Tag', createTime: '1750214725', stats: { playCount: 10 } });
    expect(v.isSponsored).toBeNull();
    expect(v.hasShopProduct).toBeNull();
    expect(v.hashtags).toEqual(['tag']);
    expect(v.postedAt).not.toBeNull();
    expect(() => normalizeScrapeCreatorsVideo({ desc: 'x' })).toThrow(ProviderError);
    expect(() => normalizeScrapeCreatorsProfile({ nickname: 'x' })).toThrow(ProviderError);
  });

  it('parses TikTok handles from URLs', () => {
    expect(parseTiktokHandle('https://www.tiktok.com/@brand.th?lang=th')).toBe('brand.th');
    expect(parseTiktokHandle('@brand_th')).toBe('brand_th');
    expect(parseTiktokHandle('https://example.com')).toBeNull();
  });
});
