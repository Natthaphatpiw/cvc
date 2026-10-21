import { REF_SEED, type CandidateRef, type RefData } from '@cvc/schemas';
import { describe, expect, it } from 'vitest';
import { gate0a, gate0b, gate0c, preScore, restrictedCategories, type GateContext } from './gates';
import { estimateFee } from './ref';
import { NOW, daysAgo, dossier, evaluation, video } from './test-fixtures';

const ctx = (over: Partial<GateContext> = {}): GateContext => ({
  now: NOW,
  followerRange: { min: 10_000, max: 500_000 },
  excludeHandles: ['@Excluded_One'],
  blockedHandles: ['blocked.one'],
  competitors: ['Glowy Lab'],
  exclusivityWindowDays: 90,
  budgetPerCreatorTHB: 40_000,
  minVideos90d: 8,
  brandSafetyLevel: 'standard',
  categoryPolicy: { 'health.supplement': 'restricted', alcohol: 'prohibited' },
  ...over,
});

const ref = (over: Partial<CandidateRef> = {}): CandidateRef => ({
  platformUserId: 'p1',
  handle: 'creator_ok',
  followers: 80_000,
  region: 'TH',
  videoCount: 200,
  lastPostedAt: daysAgo(3),
  matchedQuery: 'สกินแคร์',
  avatarSourceUrl: null,
  ...over,
});

describe('gate0a', () => {
  it('passes a clean Thai candidate and unknown values', () => {
    expect(gate0a(ref(), ctx())).toEqual([]);
    expect(gate0a(ref({ region: null, followers: null, lastPostedAt: null }), ctx())).toEqual([]);
  });

  it('returns stable failure codes', () => {
    expect(gate0a(ref({ region: 'US' }), ctx())).toEqual(['not_thai']);
    expect(gate0a(ref({ lastPostedAt: daysAgo(40) }), ctx())).toEqual(['inactive_30d']);
    expect(gate0a(ref({ followers: 2_000_000 }), ctx())).toEqual(['follower_range']);
    expect(gate0a(ref({ handle: '@Blocked.One' }), ctx())).toEqual(['blocklisted']);
    expect(gate0a(ref({ handle: 'excluded_one' }), ctx())).toEqual(['excluded_handle']);
  });

  it('uses activeDays for the inactivity check when set', () => {
    expect(gate0a(ref({ lastPostedAt: daysAgo(45) }), ctx({ activeDays: 60 }))).toEqual([]);
    expect(gate0a(ref({ lastPostedAt: daysAgo(65) }), ctx({ activeDays: 60 }))).toEqual(['inactive_30d']);
  });
});

describe('gate0b', () => {
  const fee = { min: 5_000, max: 30_000 };

  it('passes an active Thai creator within budget', () => {
    expect(gate0b(dossier('a'), fee, ctx())).toEqual([]);
  });

  it('requires enough videos in 90 days', () => {
    const d = dossier('a', { videos: Array.from({ length: 5 }, (_, i) => video({ platformVideoId: `v${i}`, postedAt: daysAgo(2 + i) })) });
    expect(gate0b(d, fee, ctx())).toEqual(['min_videos_90d']);
  });

  it('detects competitor sponsorships inside the exclusivity window', () => {
    const viaCollab = dossier('a', { collabs: [{ brandName: 'GLOWY LAB', detectedVia: 'caption', detectedAt: daysAgo(30) }] });
    expect(gate0b(viaCollab, fee, ctx())).toEqual(['competitor_exclusivity']);
    const oldCollab = dossier('a', { collabs: [{ brandName: 'Glowy Lab', detectedVia: 'caption', detectedAt: daysAgo(200) }] });
    expect(gate0b(oldCollab, fee, ctx())).toEqual([]);
    const base = dossier('a');
    const viaPost = dossier('a', {
      videos: [...base.videos, video({ platformVideoId: 'sp', postedAt: daysAgo(10), isSponsored: true, caption: 'ร่วมกับ #GlowyLab เซรั่มใหม่' })],
    });
    expect(gate0b(viaPost, fee, ctx())).toEqual(['competitor_exclusivity']);
  });

  it('excludes creators whose cheapest fee exceeds the per-creator budget', () => {
    expect(gate0b(dossier('a'), { min: 50_000, max: 100_000 }, ctx())).toEqual(['fee_over_budget']);
    expect(gate0b(dossier('a'), { min: 50_000, max: 100_000 }, ctx({ budgetPerCreatorTHB: null }))).toEqual([]);
  });

  it('checks Thai signals and activity on the full dossier', () => {
    const base = dossier('a');
    const foreign = dossier('a', {
      profile: { ...base.profile, region: null, bio: 'Daily vlog from Manila' },
      videos: base.videos.map((v) => ({ ...v, locationCreated: 'PH', caption: 'Morning routine', textLanguage: 'en' })),
    });
    expect(gate0b(foreign, fee, ctx())).toEqual(['not_thai']);
    const idle = dossier('a', { videos: base.videos.map((v, i) => ({ ...v, postedAt: daysAgo(35 + i) })) });
    idle.metrics = { ...idle.metrics, lastPostedAt: daysAgo(35) };
    expect(gate0b(idle, fee, ctx())).toContain('inactive_30d');
    expect(gate0b(idle, fee, ctx({ activeDays: 60 }))).not.toContain('inactive_30d');
  });
});

describe('gate0c', () => {
  it('applies the suitability floor of the brand-safety level', () => {
    expect(gate0c(evaluation('a', {}, { suitabilityTier: 'medium' }), ctx())).toEqual([]);
    expect(gate0c(evaluation('a', {}, { suitabilityTier: 'medium' }), ctx({ brandSafetyLevel: 'strict' }))).toEqual(['suitability_floor']);
    expect(gate0c(evaluation('a', {}, { suitabilityTier: 'high' }), ctx())).toEqual(['suitability_floor']);
    expect(gate0c(evaluation('a', {}, { suitabilityTier: 'high' }), ctx({ brandSafetyLevel: 'relaxed' }))).toEqual([]);
  });

  it('excludes possible minors and prohibited BC categories (restricted only needs sign-off)', () => {
    expect(gate0c(evaluation('a', {}, { possibleMinor: true }), ctx())).toEqual(['possible_minor']);
    expect(gate0c(evaluation('a', {}, { categoryTags: ['alcohol.beer'] }), ctx())).toEqual(['bc_prohibited']);
    const restricted = evaluation('a', {}, { categoryTags: ['health.supplement'] });
    expect(gate0c(restricted, ctx())).toEqual([]);
    expect(restrictedCategories(restricted, ctx())).toEqual(['health.supplement']);
  });
});

describe('preScore', () => {
  it('is deterministic, bounded and prefers active Thai mid-sized creators', () => {
    const good = preScore(ref());
    expect(good).toBeGreaterThan(0);
    expect(good).toBeLessThanOrEqual(1);
    expect(preScore(ref())).toBe(good);
    expect(preScore(ref({ region: 'US' }))).toBeLessThan(good);
    expect(preScore(ref({ followers: 300 }))).toBeLessThan(good);
  });
});

describe('estimateFee', () => {
  it('applies the niche multiplier (parent category when the sub-category is unknown) and rounds to 500', () => {
    expect(estimateFee('micro', 'beauty.skincare', REF_SEED)).toEqual({ min: 6_000, max: 34_500 });
    expect(estimateFee('micro', 'beauty.unknown_sub', REF_SEED)).toEqual({ min: 5_500, max: 33_000 });
    expect(estimateFee('micro', null, REF_SEED)).toEqual({ min: 5_000, max: 30_000 });
    expect(estimateFee('micro', 'not_a_category', REF_SEED)).toEqual({ min: 5_000, max: 30_000 });
    expect(estimateFee(null, 'beauty', REF_SEED)).toEqual({ min: 0, max: 0 });
  });

  it('prefers cvc_internal cards, then category-specific, then generic', () => {
    const r: RefData = {
      ...REF_SEED,
      rateCards: [
        ...REF_SEED.rateCards,
        { tier: 'micro', categoryId: 'beauty', format: 'in_feed', feeMinTHB: 8_000, feeMaxTHB: 25_000, source: 'clisk_2026' },
        { tier: 'micro', categoryId: null, format: 'in_feed', feeMinTHB: 7_000, feeMaxTHB: 20_000, source: 'cvc_internal' },
        { tier: 'micro', categoryId: 'food', format: 'in_feed', feeMinTHB: 1_000, feeMaxTHB: 2_000, source: 'cvc_internal' },
      ],
    };
    // cvc_internal generic card × beauty.skincare multiplier 1.15
    expect(estimateFee('micro', 'beauty.skincare', r)).toEqual({ min: 8_000, max: 23_000 });
    const noInternal: RefData = { ...r, rateCards: r.rateCards.filter((c) => c.source !== 'cvc_internal') };
    // category-specific (parent) card, no multiplier on top
    expect(estimateFee('micro', 'beauty.skincare', noInternal)).toEqual({ min: 8_000, max: 25_000 });
    // live format without a live card falls back to in_feed
    expect(estimateFee('nano', null, REF_SEED, 'live')).toEqual({ min: 1_500, max: 5_000 });
  });
});
