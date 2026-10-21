// Builders for unit tests (not exported from the package index). Fictional creators only.
import type { CreatorDossier, CreatorMetrics, CreatorVideo, KolEvaluation, RubricCriterion, Tier } from '@cvc/schemas';
import type { EvaluatedCandidate } from './score';

export const NOW = new Date('2026-10-21T05:00:00Z');
export const DAY = 86_400_000;
export const daysAgo = (d: number): string => new Date(NOW.getTime() - d * DAY).toISOString();

export function video(over: Partial<CreatorVideo> = {}): CreatorVideo {
  return {
    platformVideoId: 'v',
    url: 'https://www.tiktok.com/@demo/video/1',
    postedAt: daysAgo(5),
    caption: 'รีวิวสกินแคร์ใช้จริง',
    hashtags: [],
    durationS: 30,
    views: 10_000,
    likes: 500,
    comments: 50,
    shares: 20,
    saves: 30,
    isSponsored: false,
    isAd: false,
    hasShopProduct: false,
    locationCreated: 'TH',
    textLanguage: 'th',
    coverSourceUrl: null,
    ...over,
  };
}

export function metrics(over: Partial<CreatorMetrics> = {}): CreatorMetrics {
  return {
    videosAnalyzed: 20,
    medianViews: 50_000,
    p25Views: 30_000,
    p75Views: 90_000,
    erViewsMedian: 0.05,
    postsPerWeek: 3,
    viewsCv: 0.08,
    lastPostedAt: daysAgo(2),
    sponsoredCount: 2,
    sponsoredShare: 0.1,
    erSponsored: 0.04,
    erOrganic: 0.05,
    medianViewsSponsored: 40_000,
    medianViewsOrganic: 52_000,
    followerGrowth30d: null,
    bestDays: [],
    bestHours: [],
    ...over,
  };
}

export function dossier(id: string, over: Partial<CreatorDossier> & { followers?: number; tier?: Tier | null } = {}): CreatorDossier {
  const { followers = 80_000, ...rest } = over;
  return {
    creatorId: id,
    profile: {
      platform: 'tiktok',
      platformUserId: `pu-${id}`,
      handle: `creator_${id}`,
      displayName: null,
      bio: 'รีวิวของใช้จริง ไม่อวย',
      bioLink: null,
      avatarSourceUrl: null,
      isVerified: false,
      region: 'TH',
      language: 'th',
      isShopSeller: false,
      isCommerceUser: false,
      followerCount: followers,
      followingCount: 200,
      likesCount: 1_000_000,
      videoCount: 300,
    },
    tier: 'micro',
    avatarUrl: null,
    videos: Array.from({ length: 12 }, (_, i) => video({ platformVideoId: `${id}-v${i}`, postedAt: daysAgo(3 + i * 3) })),
    metrics: metrics(),
    audience: {
      source: 'heuristic_comments',
      countryDist: null,
      ageDist: { '18-24': 0.5, '25-34': 0.4, '35-44': 0.1 },
      genderDist: { female: 0.8, male: 0.2 },
      regionDist: null,
      thaiShare: 0.9,
      sampleSize: 40,
      ci95: [0.8, 0.97],
      confidence: 'medium',
      commentSignals: null,
    },
    collabs: [],
    categories: ['beauty.skincare'],
    suitabilityTier: 'low',
    fetchedAt: NOW.toISOString(),
    ...rest,
  };
}

export function evaluation(id: string, scores: Partial<Record<RubricCriterion, 0 | 1 | 2>> = {}, over: Partial<KolEvaluation> = {}): KolEvaluation {
  const all: RubricCriterion[] = ['audience_fit', 'content_product_relevance', 'persuasion', 'credibility', 'format_execution'];
  return {
    creatorId: id,
    handle: `creator_${id}`,
    rubric: all.map((criterion) => ({ criterion, score: scores[criterion] ?? 1, evidenceVideoIds: [`${id}-v0`], noteTh: 'หมายเหตุ' })),
    suitabilityTier: 'low',
    categoryTags: ['beauty.skincare'],
    toneTags: [],
    possibleMinor: false,
    rationaleTh: 'เหตุผล',
    ...over,
  };
}

export function candidate(
  id: string,
  over: {
    dossier?: Partial<CreatorDossier> & { followers?: number };
    metrics?: Partial<CreatorMetrics>;
    scores?: Partial<Record<RubricCriterion, 0 | 1 | 2>>;
    semantic?: number | null;
    fee?: { min: number; max: number };
    suspectedInjection?: boolean;
    gateFailures?: string[];
    evaluation?: KolEvaluation | null;
  } = {},
): EvaluatedCandidate {
  const d = dossier(id, over.dossier);
  d.metrics = metrics(over.metrics);
  return {
    dossier: d,
    evaluation: over.evaluation === undefined ? evaluation(id, over.scores) : over.evaluation,
    semantic: over.semantic === undefined ? 0.5 : over.semantic,
    suspectedInjection: over.suspectedInjection ?? false,
    estFeeTHB: over.fee ?? { min: 5_000, max: 30_000 },
    gateFailures: over.gateFailures ?? [],
  };
}
