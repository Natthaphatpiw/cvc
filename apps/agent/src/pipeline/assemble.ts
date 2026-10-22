import type { CandidateRow } from '@cvc/db';
import { INNER_WEIGHTS, computeExpectedKpis, creatorNextActions, playbookHints } from '@cvc/scoring';
import type {
  Alternative,
  BrandProfile,
  CollaborationModel,
  CreatorDossier,
  CuratorOutput,
  EvidenceSourceType,
  FinalResult,
  GroupWeights,
  MinMax,
  NarrativeStatus,
  NextAction,
  Objective,
  Playbook,
  PortfolioNarrative,
  PortfolioPlan,
  RankedCreator,
  Recommendation,
  RefData,
  ResultEvidence,
  ScoreGroup,
  Tier,
  TierBenchmark,
  ValueSource,
} from '@cvc/schemas';
import { formatCompact, formatDateTh, formatNumber, formatPct, formatTHB, formatTHBRange } from '@cvc/thai';
import {
  GROUP_TH,
  OBJECTIVE_TH,
  ROLE_TH,
  audienceSummaryTh,
  brandIndustryTh,
  brandOneLinerTh,
  PRICE_TH,
  strongestGroup,
  templateOverviewTh,
} from './text';
import type { CuratedItem, SourceRef } from './types';

/** A candidate row that has been enriched and ranked. */
export type RankedRow = CandidateRow & { dossier: CreatorDossier; ranked: RankedCreator };

export function isRankedRow(r: CandidateRow): r is RankedRow {
  return r.dossier !== null && r.ranked !== null;
}

export function sortByRank(rows: CandidateRow[]): RankedRow[] {
  return rows.filter(isRankedRow).sort((a, b) => a.ranked.rank - b.ranked.rank);
}

export function profileUrl(handle: string): string {
  return `https://www.tiktok.com/@${handle.replace(/^@/, '')}`;
}

export function categoryFor(row: CandidateRow, brand: BrandProfile): string | null {
  return row.evaluation?.categoryTags[0] ?? brand.brand.industryId ?? null;
}

const SCORE_GROUPS: readonly ScoreGroup[] = ['fit', 'audience', 'performance', 'trust', 'cost'];

const pct100 = (x: number): number => Math.round(Math.max(0, Math.min(1, x)) * 100);

function benchmark(ref: RefData, tier: Tier | null, categoryId: string | null, metric: TierBenchmark['metric']): number | null {
  if (!tier) return null;
  const rows = ref.tierBenchmarks.filter((b) => b.tier === tier && b.metric === metric);
  const exact = rows.find((b) => b.categoryId !== null && b.categoryId === categoryId);
  return (exact ?? rows.find((b) => b.categoryId === null) ?? null)?.p50 ?? null;
}

function feeMid(fee: MinMax): number {
  return (fee.min + fee.max) / 2;
}

export function estimatedCpv(fee: MinMax, medianViews: number | null): number | null {
  if (!medianViews || medianViews <= 0 || fee.max <= 0) return null;
  return Math.round((feeMid(fee) / medianViews) * 100) / 100;
}

// ---------------------------------------------------------------------------------------------
// {{metric:…}} placeholders (LLM4 never writes raw numbers; code fills them)
// ---------------------------------------------------------------------------------------------

type MetricValues = Record<string, string>;

function metricValues(row: RankedRow, item: CuratedItem, fee: MinMax): MetricValues {
  const m = row.dossier.metrics;
  const g = row.ranked.groups;
  const cpv = estimatedCpv(fee, m.medianViews);
  const views = formatCompact(m.medianViews);
  const er = formatPct(m.erViewsMedian);
  return {
    er,
    er_views: er,
    median_views: views,
    views,
    followers: formatCompact(row.dossier.profile.followerCount),
    posts_per_week: formatNumber(m.postsPerWeek, 1),
    fee: formatTHBRange(fee),
    fee_min: formatTHB(fee.min),
    fee_max: formatTHB(fee.max),
    cpv: cpv === null ? '–' : `฿${cpv.toFixed(2)}`,
    total: String(Math.round(row.ranked.total)),
    score: String(Math.round(row.ranked.total)),
    fit: String(pct100(g.fit)),
    audience: String(pct100(g.audience)),
    performance: String(pct100(g.performance)),
    trust: String(pct100(g.trust)),
    cost: String(pct100(g.cost)),
    tier: row.dossier.tier ?? '–',
    sponsored_share: formatPct(m.sponsoredShare),
    expected_views: formatCompact(item.kpis.perPost.views.p50),
    expected_engagements: formatCompact(item.kpis.perPost.engagements.p50),
    last_posted: m.lastPostedAt ? formatDateTh(m.lastPostedAt) : '–',
  };
}

export function fillPlaceholders(text: string, values: MetricValues): string {
  return text.replace(/\{\{\s*metric\s*:\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key.toLowerCase()] ?? '–');
}

function fillCurator(c: CuratorOutput, v: MetricValues): CuratorOutput {
  const f = (s: string) => fillPlaceholders(s, v);
  return {
    ...c,
    whyMatchTh: c.whyMatchTh.map((w) => ({ ...w, text: f(w.text) })),
    risksTh: c.risksTh.map(f),
    // curate checkpoints written before the field existed are read back without a parse
    fitSummaryTh: f(c.fitSummaryTh ?? ''),
    storyline: {
      ...c.storyline,
      conceptTh: f(c.storyline.conceptTh),
      hookTh: f(c.storyline.hookTh),
      ctaTh: f(c.storyline.ctaTh),
      sampleCaptionTh: f(c.storyline.sampleCaptionTh),
    },
    pitchAnglesTh: c.pitchAnglesTh.map(f),
    topVideoNotes: c.topVideoNotes.map((n) => ({ ...n, whyTh: f(n.whyTh) })),
    playbookText: {
      roleReasonTh: f(c.playbookText.roleReasonTh),
      collaborationNoteTh: f(c.playbookText.collaborationNoteTh),
      contentAnglesTh: c.playbookText.contentAnglesTh.map(f),
      briefDosTh: c.playbookText.briefDosTh.map(f),
      briefDontsTh: c.playbookText.briefDontsTh.map(f),
      negotiationTh: c.playbookText.negotiationTh.map(f),
      riskMitigations: c.playbookText.riskMitigations.map((r) => ({ riskTh: f(r.riskTh), mitigationTh: f(r.mitigationTh) })),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// template text (narrativeStatus 'failed' | 'pending')
// ---------------------------------------------------------------------------------------------

const COLLAB_TH: Record<CollaborationModel, string> = {
  fixed_fee: 'จ่ายค่าตอบแทนแบบเหมาต่อชิ้นงาน กำหนดจำนวนคลิปและสิทธิ์การใช้งานให้ชัดเจน',
  affiliate_commission: 'จ่ายค่าคอมมิชชันตามยอดขายผ่านลิงก์หรือตะกร้าสินค้า',
  hybrid: 'ค่าตอบแทนคงที่ผสมค่าคอมมิชชันตามยอดขาย',
  gifting: 'ส่งสินค้าให้ทดลองใช้ โดยไม่บังคับโพสต์หรือค่าตอบแทน',
};

function templateWhy(row: RankedRow, poolMedians: GroupWeights): { text: string; evidenceRefs: string[] }[] {
  const g = row.ranked.groups;
  const ordered = [...SCORE_GROUPS].sort((a, b) => g[b] - g[a]).slice(0, 2);
  const out = ordered.map((group) => {
    const score = pct100(g[group]);
    const median = poolMedians[group];
    const above = score > median ? ` สูงกว่าค่ากลางของครีเอเตอร์ที่ประเมิน (${median})` : '';
    return { text: `คะแนนด้าน${GROUP_TH[group]} ${score}/100${above}`, evidenceRefs: [] };
  });
  const m = row.dossier.metrics;
  if (m.medianViews !== null) {
    out.push({
      text: `ยอดวิวกลาง ${formatCompact(m.medianViews)} ต่อคลิป และอัตราการมีส่วนร่วม ${formatPct(m.erViewsMedian)} จาก ${m.videosAnalyzed} คลิปล่าสุด`,
      evidenceRefs: [],
    });
  }
  return out;
}

function templateRisks(row: RankedRow): string[] {
  const m = row.dossier.metrics;
  const risks: string[] = [];
  if (row.ranked.suspectedInjection) risks.push('พบข้อความในโปรไฟล์หรือแคปชันที่อาจพยายามชี้นำระบบ ควรตรวจสอบด้วยตนเองก่อนติดต่อ');
  if (m.videosAnalyzed < 8) risks.push('มีวิดีโอให้วิเคราะห์น้อย ตัวเลขคาดการณ์อาจคลาดเคลื่อน');
  if ((m.sponsoredShare ?? 0) > 0.4) risks.push('สัดส่วนโพสต์โฆษณาค่อนข้างสูง ผู้ชมอาจตอบสนองต่อคอนเทนต์ขายของน้อยลง');
  if (row.ranked.missingFeatures.length > 0) risks.push('ข้อมูลบางด้านไม่ครบ คะแนนจึงคำนวณจากข้อมูลที่มี');
  return risks;
}

/** Fit paragraph for creators with neither an LLM4 narrative nor an LLM2b rationale. */
function templateFitSummaryTh(row: RankedRow): string {
  const g = row.ranked.groups;
  const [first = 'fit', second = 'audience'] = [...SCORE_GROUPS].sort((a, b) => g[b] - g[a]);
  const m = row.dossier.metrics;
  const risk = templateRisks(row)[0];
  return [
    `@${row.dossier.profile.handle} โดดเด่นด้าน${GROUP_TH[first]}และ${GROUP_TH[second]} (คะแนน ${pct100(g[first])} และ ${pct100(g[second])} จาก 100)`,
    m.medianViews !== null ? `ยอดวิวกลาง ${formatCompact(m.medianViews)} ต่อคลิป อัตราการมีส่วนร่วม ${formatPct(m.erViewsMedian)} จาก ${m.videosAnalyzed} คลิปล่าสุด` : '',
    risk ? `ข้อควรระวัง: ${risk}` : '',
  ]
    .filter((s) => s.length > 0)
    .join(' ');
}

function buildPlaybook(item: CuratedItem, curator: CuratorOutput | null, row: RankedRow, fee: MinMax, brandPillars: string[]): Playbook {
  const h = item.hints;
  const text = curator?.playbookText;
  return {
    role: h.role,
    roleReasonTh: text?.roleReasonTh ?? `เหมาะกับบท${ROLE_TH[h.role]} จากจุดแข็งด้าน${GROUP_TH[strongestGroup(row.ranked.groups)]}`,
    recommendedFormats: h.recommendedFormats,
    postingWindow: h.postingWindow,
    collaborationModel: h.collaborationModel,
    collaborationNoteTh: text?.collaborationNoteTh ?? COLLAB_TH[h.collaborationModel],
    contentAnglesTh: text?.contentAnglesTh ?? brandPillars.slice(0, 2).map((p) => `เล่าเรื่อง "${p}" ในสไตล์ของครีเอเตอร์เอง`),
    briefDosTh: text?.briefDosTh ?? ['ให้ครีเอเตอร์เล่าเรื่องด้วยภาษาและสไตล์ของตัวเอง', 'ระบุ #โฆษณา หรือแท็กความร่วมมือทุกครั้ง'],
    briefDontsTh: text?.briefDontsTh ?? ['หลีกเลี่ยงสคริปต์ที่อ่านเหมือนโฆษณา', 'ห้ามกล่าวอ้างสรรพคุณเกินจริง'],
    negotiationTh: text?.negotiationTh ?? [`ช่วงค่าตัวโดยประมาณ ${formatTHBRange(fee)} ต่อคลิป`],
    riskMitigations: text?.riskMitigations ?? [],
  };
}

// ---------------------------------------------------------------------------------------------
// builders
// ---------------------------------------------------------------------------------------------

/** Expected KPIs, playbook hints and next actions in code only (no LLM). */
export function codeOnlyCuration(a: {
  row: RankedRow;
  objective: Objective;
  ref: RefData;
  categoryId: string | null;
  status: NarrativeStatus;
}): CuratedItem {
  const fee = a.row.estFeeTHB ?? { min: 0, max: 0 };
  const kpis = computeExpectedKpis({
    metrics: a.row.dossier.metrics,
    tier: a.row.dossier.tier,
    fee,
    objective: a.objective,
    categoryId: a.categoryId,
    ref: a.ref,
  });
  const hints = playbookHints({ dossier: a.row.dossier, ranked: a.row.ranked, objective: a.objective });
  const nextActions = creatorNextActions({ creatorId: a.row.creatorId, handle: a.row.handle, playbook: hints, objective: a.objective });
  return { creatorId: a.row.creatorId, status: a.status, curator: null, kpis, hints, nextActions };
}

export function buildRecommendation(a: {
  rank: number;
  row: RankedRow;
  item: CuratedItem;
  poolMedians: GroupWeights;
  ref: RefData;
  categoryId: string | null;
  covers: Record<string, string | null>;
  brandPillars: string[];
}): Recommendation {
  const { row, item } = a;
  const d = row.dossier;
  const m = d.metrics;
  const fee = row.estFeeTHB ?? item.kpis.cost.feeTHB;
  const values = metricValues(row, item, fee);
  const curator = item.curator ? fillCurator(item.curator, values) : null;
  const g = row.ranked.groups;
  const aud = d.audience;
  const ageTop = aud?.ageDist
    ? Object.entries(aud.ageDist)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 2)
        .map(([k]) => k)
    : [];
  const female = aud?.genderDist ? (aud.genderDist.female ?? aud.genderDist.f ?? null) : null;
  const notes = new Map((curator?.topVideoNotes ?? []).map((n) => [n.videoId, n.whyTh]));
  const topVideos = [...d.videos]
    .sort((x, y) => (y.views ?? 0) - (x.views ?? 0))
    .slice(0, 3)
    .map((v) => ({
      url: v.url,
      coverUrl: a.covers[v.platformVideoId] ?? null,
      views: v.views,
      whyTh: notes.get(v.platformVideoId) ?? `ยอดวิว ${formatCompact(v.views)} สูงในกลุ่มคลิปล่าสุดของครีเอเตอร์`,
    }));
  const evidenceRefs = [...new Set((curator?.whyMatchTh ?? []).flatMap((w) => w.evidenceRefs))];

  return {
    rank: a.rank,
    creatorId: row.creatorId,
    addedVia: 'pipeline',
    handle: d.profile.handle,
    displayName: d.profile.displayName,
    profileUrl: profileUrl(d.profile.handle),
    avatarUrl: d.avatarUrl,
    tier: d.tier,
    followers: d.profile.followerCount,
    medianViews: m.medianViews,
    erViews: m.erViewsMedian,
    postsPerWeek: m.postsPerWeek,
    lastPostedAt: m.lastPostedAt,
    audience: {
      thaiShare: aud?.thaiShare ?? null,
      ageTop,
      ageDist: aud?.ageDist ?? null,
      femaleShare: female,
      sampleSize: aud?.sampleSize ?? null,
      ci95: aud?.ci95 ?? null,
      confidence: aud?.confidence ?? 'low',
      source: aud?.source ?? 'heuristic_content',
    },
    scores: {
      total: Math.round(row.ranked.total),
      fit: pct100(g.fit),
      audience: pct100(g.audience),
      performance: pct100(g.performance),
      trust: pct100(g.trust),
      cost: pct100(g.cost),
      rankStability: row.ranked.rankStability,
      sub: row.ranked.sub,
      missingFeatures: row.ranked.missingFeatures,
    },
    benchmarks: {
      tierMedianViews: benchmark(a.ref, d.tier, a.categoryId, 'median_views'),
      tierMedianEr: benchmark(a.ref, d.tier, a.categoryId, 'er_views'),
      tierMedianCPV: benchmark(a.ref, d.tier, a.categoryId, 'cpv_thb'),
      poolMedianScores: a.poolMedians,
    },
    rubric: row.evaluation?.rubric ?? [],
    suspectedInjection: row.ranked.suspectedInjection,
    narrativeStatus: curator ? 'ready' : item.status === 'ready' ? 'failed' : item.status,
    whyMatchTh: curator?.whyMatchTh ?? templateWhy(row, a.poolMedians),
    risksTh: curator?.risksTh ?? templateRisks(row),
    fitSummaryTh: curator?.fitSummaryTh || row.evaluation?.rationaleTh || templateFitSummaryTh(row),
    storyline: curator?.storyline ?? null,
    pitchAnglesTh: curator?.pitchAnglesTh ?? [],
    estFeeTHB: fee,
    estCPV: estimatedCpv(fee, m.medianViews),
    topVideos,
    playbook: buildPlaybook(item, curator, row, fee, a.brandPillars),
    expectedKpis: item.kpis,
    nextActions: item.nextActions,
    evidenceRefs,
    dataConfidence: row.ranked.dataConfidence,
  };
}

export function buildAlternative(row: RankedRow): Alternative {
  const g = row.ranked.groups;
  const best = strongestGroup(g);
  return {
    creatorId: row.creatorId,
    handle: row.dossier.profile.handle,
    profileUrl: profileUrl(row.dossier.profile.handle),
    avatarUrl: row.dossier.avatarUrl,
    reasonTh: `คะแนนรวม ${Math.round(row.ranked.total)} จุดเด่นด้าน${GROUP_TH[best]} (${pct100(g[best])}/100)`,
    total: Math.round(row.ranked.total),
  };
}

const EVIDENCE_TYPE: Record<SourceRef['sourceType'], EvidenceSourceType> = {
  website: 'website',
  facebook_page: 'facebook',
  facebook_posts: 'facebook',
  facebook_ads: 'facebook_ads',
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  web_search: 'web_search',
  pantip: 'pantip',
};

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function inferEvidenceType(url: string, brandWebsite: string | null): EvidenceSourceType {
  const host = hostOf(url) ?? '';
  if (host.endsWith('facebook.com') || host.endsWith('fb.com')) return 'facebook';
  if (host.endsWith('tiktok.com')) return 'tiktok';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('pantip.com')) return 'pantip';
  const site = hostOf(brandWebsite);
  if (site && (host === site || host.endsWith(`.${site}`))) return 'website';
  return 'web_search';
}

export function buildEvidence(brand: BrandProfile, docs: SourceRef[]): ResultEvidence[] {
  const out: ResultEvidence[] = brand.evidence.map((e) => ({
    ref: e.ref,
    title: e.claim.slice(0, 160),
    url: e.url,
    sourceType: inferEvidenceType(e.url, brand.brand.website),
    retrievedAt: e.retrievedAt,
  }));
  const seen = new Set(out.map((e) => e.url));
  let n = 0;
  for (const d of docs) {
    if (!d.url || seen.has(d.url)) continue;
    seen.add(d.url);
    n += 1;
    out.push({ ref: `S${n}`, title: d.title || d.url, url: d.url, sourceType: EVIDENCE_TYPE[d.sourceType], retrievedAt: d.fetchedAt });
  }
  return out;
}

export function effectiveDemographicWeight(weights: GroupWeights, recs: Recommendation[]): number {
  if (recs.length === 0) return 0;
  const withDemo = recs.filter((r) => r.scores.sub.audience.demo !== null).length / recs.length;
  return Math.round(weights.audience * INNER_WEIGHTS.audience.demo * withDemo * 1000) / 1000;
}

/** brief.recommendedTiers: the brand's preferred tiers, else the tiers of the recommended creators. */
export function recommendedTiersFor(preferred: readonly Tier[], recommendations: readonly Recommendation[]): Tier[] {
  return preferred.length > 0 ? [...preferred] : [...new Set(recommendations.map((r) => r.tier).filter((t): t is Tier => t !== null))];
}

/** Code headline, used when there is no portfolio narrative (or it no longer matches the picks). */
export function templateHeadlineTh(a: { brandName: string; objective: Objective; count: number }): string {
  return `แนะนำครีเอเตอร์ TikTok ${a.count} คนสำหรับ ${a.brandName} เพื่อ${OBJECTIVE_TH[a.objective]}`;
}

/** Code consultant summary: pool size, rank 1 and the plan's budget fit. */
export function templateSummaryTh(a: {
  candidatesScanned: number;
  candidatesEvaluated: number;
  top: Recommendation | undefined;
  budgetFitTh: string;
}): string {
  return [
    `คัดจากครีเอเตอร์ที่ค้นพบ ${a.candidatesScanned} คน และประเมินเชิงลึก ${a.candidatesEvaluated} คน`,
    a.top ? `อันดับ 1 คือ @${a.top.handle} คะแนนรวม ${a.top.scores.total}` : '',
    a.budgetFitTh,
  ]
    .filter((s) => s.length > 0)
    .join(' · ');
}

export function buildFinalResult(a: {
  resultId: string;
  runId: string;
  version: number;
  generatedAt: string;
  isDemo: boolean;
  isPartial: boolean;
  brand: BrandProfile;
  ref: RefData;
  objective: Objective;
  /** whether the client gave the target audience (audienceSourceOf the brief) */
  audienceSource: ValueSource;
  weights: GroupWeights;
  budgetTHB: MinMax | null;
  nCreators: number;
  recommendations: Recommendation[];
  alternatives: Alternative[];
  plan: PortfolioPlan;
  narrative: PortfolioNarrative | null;
  baseActions: NextAction[];
  candidatesScanned: number;
  candidatesEvaluated: number;
  dataSources: string[];
  dataAsOf: string;
  caveatsTh: string[];
  sourceDocs: SourceRef[];
}): FinalResult {
  const b = a.brand;
  const keyMessages = [
    ...new Set([...b.brand.products.map((p) => p.usp).filter((u): u is string => typeof u === 'string' && u.trim().length > 0), ...b.brand.contentPillars]),
  ].slice(0, 4);
  const tiers = recommendedTiersFor(b.campaign.preferredTiers, a.recommendations);
  const headline =
    a.narrative?.headlineTh ?? templateHeadlineTh({ brandName: b.brand.name, objective: a.objective, count: a.recommendations.length });
  const summary =
    a.narrative?.consultantSummaryTh ??
    templateSummaryTh({
      candidatesScanned: a.candidatesScanned,
      candidatesEvaluated: a.candidatesEvaluated,
      top: a.recommendations[0],
      budgetFitTh: a.plan.budgetFitTh,
    });

  return {
    schemaVersion: '1.0',
    resultId: a.resultId,
    runId: a.runId,
    version: a.version,
    generatedAt: a.generatedAt,
    locale: 'th',
    isPartial: a.isPartial,
    isDemo: a.isDemo,
    redactedCreators: 0,
    headlineTh: headline,
    consultantSummaryTh: summary,
    brand: {
      name: b.brand.name,
      logoUrl: null,
      oneLinerTh: brandOneLinerTh(b, a.ref),
      overviewTh: b.overviewTh || templateOverviewTh(b, a.ref, a.audienceSource),
      industry: brandIndustryTh(b, a.ref),
      positioning: PRICE_TH[b.brand.pricePositioning],
      audienceSummaryTh: audienceSummaryTh(b),
      toneKeywords: b.brand.personality.toneKeywords,
      contentPillars: b.brand.contentPillars,
      evidenceRefs: b.evidence.map((e) => e.ref),
    },
    // The brand step copied the brief's sources onto the profile (applyUserConstraints); old profiles parse as 'user'.
    brief: {
      objective: a.objective,
      objectiveSource: b.campaign.objectiveSource ?? 'user',
      objectiveReasonTh: b.campaign.objectiveReasonTh ?? '',
      budgetTHB: a.budgetTHB,
      nCreators: a.nCreators,
      nCreatorsSource: b.campaign.nCreatorsSource ?? 'user',
      audienceSource: a.audienceSource,
      recommendedTiers: tiers,
      budgetFitNoteTh: a.plan.budgetFitTh,
      keyMessagesTh: keyMessages,
    },
    methodology: {
      preset: a.objective,
      weights: a.weights,
      effectiveDemographicWeight: effectiveDemographicWeight(a.weights, a.recommendations),
      candidatesScanned: a.candidatesScanned,
      candidatesEvaluated: a.candidatesEvaluated,
      dataSources: a.dataSources,
      dataAsOf: a.dataAsOf,
      caveatsTh: a.caveatsTh,
    },
    recommendations: a.recommendations,
    addedFromChat: [],
    alternatives: a.alternatives,
    plan: a.narrative ? { ...a.plan, mixTh: a.narrative.mixTh || a.plan.mixTh } : a.plan,
    nextActions: a.baseActions,
    evidence: buildEvidence(b, a.sourceDocs),
  };
}
