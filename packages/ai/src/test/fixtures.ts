// Fictional test data (no real creators or brands).
import {
  FinalResult,
  RunInput,
  type CreatorDossier,
  type CreatorVideo,
  type ExpectedKpis,
  type Recommendation,
  type RankedCreator,
} from '@cvc/schemas';
import type { PlaybookHints } from '../types';

export function setStubEnv(): void {
  process.env.OPENAI_API_KEY = '';
  process.env.USE_AI_GATEWAY = 'false';
  process.env.AI_GATEWAY_API_KEY = '';
  process.env.DEMO_MODE = 'auto';
  process.env.AGENT_DATABASE_URL = '';
  process.env.OPENAI_EMBEDDING_DIMENSIONS = '1536';
}

export function runInput(overrides: Partial<Parameters<typeof RunInput.parse>[0]> = {}): RunInput {
  return RunInput.parse({
    companyName: 'ซันนี่สกิน',
    websiteUrl: 'https://www.sunny-skin.example/?utm_source=x',
    personaIds: ['th_genz_beauty_bkk', 'first_jobber'],
    audienceNotes: 'ผู้หญิงทำงาน 25-34 ผิวแพ้ง่าย อยากได้กันแดดเนื้อบางเบา',
    exclusions: { competitors: ['แบรนด์คู่แข่ง'], handles: ['@Blocked_One'] },
    noticeVersion: '2026-10-21',
    ...overrides,
  });
}

const CAPTIONS = [
  'รีวิวกันแดดสำหรับผิวแพ้ง่าย ใช้จริงสองอาทิตย์',
  'ป้ายยาเซรั่มตัวใหม่ ลิงก์ในโปรไฟล์',
  'แต่งหน้าไปทำงานใน 5 นาที',
  'สกินแคร์ก่อนนอนของฉัน',
  'กินข้าวกับเพื่อนวันหยุด',
  'vlog วันทำงาน',
  'รีวิวครีมบำรุงผิว เนื้อบางเบา',
  'กันแดดตัวไหนดี เปรียบเทียบให้ดู',
  'ตอบคำถามเรื่องผิวแพ้ง่าย',
  'เที่ยวทะเลสุดสัปดาห์',
];

export function videos(n = 12): CreatorVideo[] {
  return Array.from({ length: n }, (_, i) => ({
    platformVideoId: `v${i + 1}`,
    url: `https://www.tiktok.com/@creator_a/video/${1000 + i}`,
    postedAt: new Date(Date.UTC(2026, 9, 20 - i * 2, 12)).toISOString(),
    caption: CAPTIONS[i % CAPTIONS.length] ?? null,
    hashtags: i % 3 === 0 ? ['skincare', 'รีวิว'] : ['fyp'],
    durationS: 30 + i,
    views: 20_000 + i * 7_000,
    likes: 1_500 + i * 100,
    comments: 80 + i * 5,
    shares: 30 + i,
    saves: 10,
    isSponsored: i % 4 === 1,
    isAd: false,
    hasShopProduct: i % 5 === 0,
    locationCreated: 'TH',
    textLanguage: 'th',
    coverSourceUrl: null,
  }));
}

export function dossier(overrides: Partial<CreatorDossier> = {}): CreatorDossier {
  return {
    creatorId: 'creator-0001',
    profile: {
      platform: 'tiktok',
      platformUserId: 'u-0001',
      handle: 'creator_a',
      displayName: 'Creator A',
      bio: 'รีวิวสกินแคร์จากประสบการณ์จริง',
      bioLink: null,
      avatarSourceUrl: null,
      isVerified: false,
      region: 'TH',
      language: 'th',
      isShopSeller: true,
      isCommerceUser: true,
      followerCount: 85_000,
      followingCount: 300,
      likesCount: 1_200_000,
      videoCount: 240,
    },
    tier: 'micro',
    avatarUrl: null,
    videos: videos(),
    metrics: {
      videosAnalyzed: 12,
      medianViews: 62_000,
      p25Views: 40_000,
      p75Views: 80_000,
      erViewsMedian: 0.071,
      postsPerWeek: 4.2,
      viewsCv: 0.4,
      lastPostedAt: '2026-10-20T12:00:00.000Z',
      sponsoredCount: 3,
      sponsoredShare: 0.25,
      erSponsored: 0.05,
      erOrganic: 0.075,
      medianViewsSponsored: 50_000,
      medianViewsOrganic: 64_000,
      followerGrowth30d: null,
      bestDays: [4, 5],
      bestHours: [19, 20],
    },
    audience: {
      source: 'heuristic_comments',
      countryDist: { TH: 0.91, other: 0.09 },
      ageDist: { '18-24': 0.45, '25-34': 0.4, '35-44': 0.15 },
      genderDist: { female: 0.78, male: 0.22 },
      regionDist: null,
      thaiShare: 0.91,
      sampleSize: 40,
      ci95: [0.8, 0.97],
      confidence: 'medium',
      commentSignals: { botLikeShare: 0.02, buyIntentShare: 0.12, maleParticleShare: 0.2 },
    },
    collabs: [],
    categories: ['beauty.skincare'],
    suitabilityTier: null,
    fetchedAt: '2026-10-21T00:00:00.000Z',
    ...overrides,
  };
}

export function ranked(overrides: Partial<RankedCreator> = {}): RankedCreator {
  return {
    creatorId: 'creator-0001',
    handle: 'creator_a',
    rank: 1,
    total: 85,
    groups: { fit: 0.9175, audience: 0.8375, performance: 0.7913, trust: 0.91, cost: 0.72 },
    sub: {
      fit: { semantic: 0.9, category: 0.85, relevance: 1, style: 0.9 },
      audience: { demo: 0.7, lang_region: 0.95, interest: 1 },
      performance: { er: 0.82, reach: 0.8, consistency: 0.75, growth: null, sponsored_perf: 0.7 },
      trust: { authenticity: 0.9, saturation: 0.85, suitability: 1 },
      cost: { cpv: 0.72 },
    },
    missingFeatures: ['growth'],
    rankStability: 0.83,
    pairwiseAdjusted: false,
    dataConfidence: 0.74,
    gateFailures: [],
    suspectedInjection: false,
    ...overrides,
  };
}

export function kpis(overrides: Partial<ExpectedKpis> = {}): ExpectedKpis {
  return {
    perPost: { views: { p25: 40_000, p50: 51_000, p75: 64_000 }, engagements: { p25: 2_800, p50: 3_600, p75: 4_500 }, erViews: 0.07 },
    cost: { feeTHB: { min: 15_000, max: 30_000 }, cpv: { p25: 0.23, p50: 0.44, p75: 0.75 }, cpe: 6.25 },
    conversion: null,
    basis: {
      method: 'creator_history',
      videosAnalyzed: 12,
      sponsoredVideosAnalyzed: 3,
      sponsoredFactor: 0.8,
      sponsoredFactorSource: 'creator_history',
      windowDays: 90,
      benchmarkSources: [],
      notesTh: [],
    },
    confidence: 'medium',
    ...overrides,
  };
}

export const hints: PlaybookHints = {
  role: 'conversion_driver',
  recommendedFormats: ['in_feed', 'affiliate'],
  collaborationModel: 'hybrid',
  postingWindow: { bestDays: [4, 5], bestHours: [19, 20], basisTh: 'จากคลิปย้อนหลัง' },
};

export function recommendation(i: number, overrides: Partial<Recommendation> = {}): Recommendation {
  const r = ranked();
  return {
    rank: i + 1,
    creatorId: `creator-000${i + 1}`,
    addedVia: 'pipeline',
    handle: `creator_${String.fromCharCode(97 + i)}`,
    displayName: null,
    profileUrl: `https://www.tiktok.com/@creator_${String.fromCharCode(97 + i)}`,
    avatarUrl: null,
    tier: 'micro',
    followers: 85_000 + i * 50_000,
    medianViews: 62_000 + i * 70_000,
    erViews: 0.071 - i * 0.019,
    postsPerWeek: 4.2,
    lastPostedAt: '2026-10-20T12:00:00.000Z',
    audience: { thaiShare: 0.91, ageTop: ['18-24'], ageDist: null, femaleShare: 0.78, sampleSize: 40, ci95: null, confidence: 'medium', source: 'heuristic_comments' },
    scores: { total: 85 - i * 3, fit: 92 - i * 5, audience: 84, performance: 79 + i * 4, trust: 91, cost: 72 - i * 10, rankStability: 0.8, sub: r.sub, missingFeatures: [] },
    benchmarks: { tierMedianViews: 30_000, tierMedianEr: 0.042, tierMedianCPV: 0.55, poolMedianScores: { fit: 70, audience: 66, performance: 60, trust: 75, cost: 55 } },
    rubric: [],
    suspectedInjection: false,
    narrativeStatus: 'ready',
    whyMatchTh: [],
    risksTh: ['ข้อมูลย้อนหลังน้อย'],
    storyline: null,
    pitchAnglesTh: [],
    estFeeTHB: { min: 15_000 + i * 15_000, max: 30_000 + i * 40_000 },
    estCPV: 0.36 + i * 0.2,
    topVideos: [],
    playbook: {
      role: 'conversion_driver',
      roleReasonTh: '',
      recommendedFormats: ['in_feed'],
      postingWindow: null,
      collaborationModel: 'fixed_fee',
      collaborationNoteTh: '',
      contentAnglesTh: [],
      briefDosTh: [],
      briefDontsTh: [],
      negotiationTh: [],
      riskMitigations: [],
    },
    expectedKpis: kpis({ perPost: { views: { p25: 40_000 + i * 60_000, p50: 51_000 + i * 80_000, p75: 64_000 + i * 100_000 }, engagements: { p25: 1, p50: 2, p75: 3 }, erViews: 0.07 } }),
    nextActions: [],
    evidenceRefs: [],
    dataConfidence: 0.74,
    ...overrides,
  };
}

export function finalResult(): FinalResult {
  return FinalResult.parse({
    schemaVersion: '1.0',
    resultId: 'res-0001',
    runId: 'run-0001',
    version: 1,
    generatedAt: '2026-10-21T00:00:00.000Z',
    locale: 'th',
    isPartial: false,
    isDemo: true,
    redactedCreators: 0,
    headlineTh: 'ตัวอย่าง',
    consultantSummaryTh: 'ตัวอย่าง',
    brand: { name: 'ซันนี่สกิน', logoUrl: null, oneLinerTh: 'แบรนด์กันแดดสมมติ', industry: 'beauty.skincare', positioning: 'masstige', audienceSummaryTh: 'ผู้หญิง 18-34', toneKeywords: [], contentPillars: [], evidenceRefs: [] },
    brief: { objective: 'conversion', budgetTHB: { min: 100_000, max: 200_000 }, nCreators: 3, recommendedTiers: ['micro'], budgetFitNoteTh: '', keyMessagesTh: [] },
    methodology: {
      preset: 'conversion',
      weights: { fit: 0.35, audience: 0.25, performance: 0.2, trust: 0.1, cost: 0.1 },
      effectiveDemographicWeight: 0.08,
      candidatesScanned: 40,
      candidatesEvaluated: 20,
      dataSources: ['mock'],
      dataAsOf: '2026-10-21T00:00:00.000Z',
      caveatsTh: [],
    },
    recommendations: [recommendation(0), recommendation(1), recommendation(2)],
    addedFromChat: [],
    alternatives: [],
    plan: {
      selectedCreatorIds: ['creator-0001', 'creator-0002', 'creator-0003'],
      budgetAllocation: [],
      totals: { feeTHB: { min: 90_000, max: 220_000 }, views: { p25: 1, p50: 2, p75: 3 }, engagements: { p25: 1, p50: 2, p75: 3 }, clicks: null, orders: null },
      budgetFit: 'within',
      budgetFitTh: 'อยู่ในงบ',
      mixTh: 'ไมโคร 3 คน',
      timeline: [],
      measurementPlanTh: [],
    },
    nextActions: [],
    evidence: [],
  });
}
