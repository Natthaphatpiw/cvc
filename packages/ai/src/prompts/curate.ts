import {
  PROMPT_VERSION,
  type BrandProfile,
  type CreatorDossier,
  type CreatorRole,
  type ExpectedKpis,
  type KolEvaluation,
  type PortfolioPlan,
  type RankedCreator,
} from '@cvc/schemas';
import type { PlaybookHints } from '../types';
import { truncate } from '../text';
import { SPOTLIGHT_RULES, spotlight } from './spotlight';

export const CURATE_PROMPT_VERSION = `llm4-${PROMPT_VERSION}`;

const PLACEHOLDER_RULES = `Numbers rule (strict): never write digits for metrics, money, counts, percentages or scores. Every number must be written as a placeholder from the provided list, for example "ยอดวิวกลาง {{metric:median_views}} วิวต่อคลิป" or "ค่าจ้างประมาณ {{metric:fee_range}}". Code replaces each placeholder with the computed value. Use only placeholder names from the list; do not invent new ones and do not do arithmetic. Words such as สูง, ต่ำ, มากกว่า are fine when the provided values support them. Small counting words in plain Thai (หนึ่ง, สอง, สาม) are fine.`;

export const CURATE_CREATOR_INSTRUCTIONS = `You are LLM4, the curator and consultant writer of a TikTok creator (KOL) matching tool for the Thai market, writing for a planner at the agency Convert Cake. For ONE recommended creator you write the narrative that explains the match and tells the planner how to work with this creator. Code has already computed all metrics, expected KPIs, fees, scores, the creator's role, recommended formats, collaboration model and posting window. You write words only.

Write in Thai, concise and concrete, like a senior agency consultant:
- whyMatchTh: 3-5 reasons this creator fits the brand and the campaign objective. Each reason cites evidenceRefs: brand evidence refs (E1, E2, ...) and/or video ids from the video list that support it. Use an empty list only when the reason rests on computed metrics alone.
- risksTh: 1-4 honest risks (data gaps, sponsored-post load, audience mismatch, brand-safety notes, low confidence of estimates).
- storyline: one campaign idea for this creator. conceptTh (the idea), hookTh (what happens in the first 3 seconds), format (choose from the recommended formats when possible: in_feed, live, affiliate, series), ctaTh (fits the objective), sampleCaptionTh (a short caption in the creator's voice that ends with #โฆษณา), disclosure "#โฆษณา".
- pitchAnglesTh: 2-3 ways to pitch the collaboration to the creator.
- topVideoNotes: 2-3 video ids from the video list with one Thai sentence each on why the video is a good reference for the brief.
- playbookText: roleReasonTh explains the given role; collaborationNoteTh explains the given collaboration model; contentAnglesTh 3 content angles; briefDosTh and briefDontsTh 3 items each (include ad disclosure, no exaggerated claims; for regulated categories mention the relevant Thai rules in plain words); negotiationTh 2-3 points that use the fee and CPV placeholders; riskMitigations pair each main risk with a mitigation.

${PLACEHOLDER_RULES}

Other rules: base every statement on the provided data. Never invent facts about the creator, the brand, past collaborations, follower demographics or results. Label expectations as estimates (ค่าประมาณ). Do not mention other creators. No emoji, no markdown.

${SPOTLIGHT_RULES}`;

export const CURATE_PORTFOLIO_INSTRUCTIONS = `You are LLM4, the consultant writer of a TikTok creator (KOL) matching tool for the Thai market. Code has built the portfolio plan (selected creators, roles, budget allocation, expected totals, budget fit, timeline, measurement plan). You write the summary a planner at Convert Cake shows the client.

Write in Thai:
- headlineTh: one sentence, the single most important finding (for example the expected reach of the shortlist against the budget).
- consultantSummaryTh: three to five sentences: why this mix fits the brand and objective, how the roles work together, what to watch.
- mixTh: one or two sentences describing the creator mix by role and tier.
- nextStepsTh: 3-5 concrete next steps for the planner in order.

${PLACEHOLDER_RULES}

Other rules: use only the provided plan and picks. Expected numbers are estimates (ค่าประมาณ). Refer to creators by @handle. No emoji, no markdown.`;

export type CuratorPromptInput = {
  brand: BrandProfile;
  dossier: CreatorDossier;
  ranked: RankedCreator;
  evaluation: KolEvaluation | null;
  hints: PlaybookHints;
  kpis: ExpectedKpis;
};

export function buildCurateCreatorUserContent(a: CuratorPromptInput, placeholders: Record<string, string>, placeholderDocs: Record<string, string>): string {
  const brand = {
    name: a.brand.brand.name,
    industryId: a.brand.brand.industryId,
    products: a.brand.brand.products.slice(0, 5).map((p) => ({ name: p.name, usp: p.usp, keyBenefits: p.keyBenefits.slice(0, 3) })),
    toneKeywords: a.brand.brand.personality.toneKeywords,
    regulatedCategory: a.brand.brand.regulatedCategory,
    objective: a.brand.campaign.objective,
    criteria: a.brand.matchingQueries.criteria.map((c) => c.textTh),
    audience: a.brand.audience.segments.map((s) => s.label),
    evidence: a.brand.evidence.map((e) => ({ ref: e.ref, claim: e.claim })),
  };
  const plan = {
    role: a.hints.role,
    recommendedFormats: a.hints.recommendedFormats,
    collaborationModel: a.hints.collaborationModel,
    postingWindowKnown: a.hints.postingWindow != null,
    rank: a.ranked.rank,
    groupScores0to1: a.ranked.groups,
    missingFeatures: a.ranked.missingFeatures,
    suspectedInjection: a.ranked.suspectedInjection,
    kpiConfidence: a.kpis.confidence,
    kpiMethod: a.kpis.basis.method,
  };
  const evaluation = a.evaluation
    ? {
        rubric: a.evaluation.rubric.map((r) => ({ criterion: r.criterion, score: r.score, evidenceVideoIds: r.evidenceVideoIds, noteTh: r.noteTh })),
        brandSafetyRiskTier: a.evaluation.suitabilityTier,
        toneTags: a.evaluation.toneTags,
        rationaleTh: a.evaluation.rationaleTh,
      }
    : null;
  const videosByViews = [...a.dossier.videos].sort((x, y) => (y.views ?? -1) - (x.views ?? -1)).slice(0, 10);
  const videoList = videosByViews.map((v, i) => ({ id: v.platformVideoId, viewsRankInCreator: i + 1, isSponsored: v.isSponsored, hasShopProduct: v.hasShopProduct }));
  const captions = videosByViews.map((v) => `[${v.platformVideoId}] ${truncate(v.caption ?? '', 200)}`);
  const placeholderLines = Object.keys(placeholders).map((k) => `- {{metric:${k}}} = ${placeholders[k]} (${placeholderDocs[k] ?? k})`);

  return [
    `Creator handle: @${a.dossier.profile.handle}`,
    `Brand (code digest):\n${JSON.stringify(brand)}`,
    `Plan decided by code:\n${JSON.stringify(plan)}`,
    `Evaluation by LLM2b:\n${evaluation ? spotlight('evaluation', 'model_evaluation', JSON.stringify(evaluation)) : 'not available'}`,
    `Placeholders you may use (value shown only so you can reason about it; write the placeholder, never the value):\n${placeholderLines.join('\n')}`,
    `Video list (ids you may cite):\n${JSON.stringify(videoList)}`,
    `Captions of those videos:\n${spotlight('captions', 'video_captions', captions.join('\n'))}`,
  ].join('\n\n');
}

export function buildCuratePortfolioUserContent(
  a: { brand: BrandProfile; plan: PortfolioPlan; picks: { handle: string; role: CreatorRole; whyTh: string }[] },
  placeholders: Record<string, string>,
  placeholderDocs: Record<string, string>,
): string {
  const brand = {
    name: a.brand.brand.name,
    industryId: a.brand.brand.industryId,
    objective: a.brand.campaign.objective,
    budgetSet: a.brand.campaign.budgetTHB != null,
  };
  const plan = {
    creators: a.plan.budgetAllocation.map((b) => b.handle),
    budgetFit: a.plan.budgetFit,
    budgetFitTh: a.plan.budgetFitTh,
    codeMixTh: a.plan.mixTh,
    timeline: a.plan.timeline.map((t) => t.titleTh),
    measurementPlanTh: a.plan.measurementPlanTh,
  };
  const picks = a.picks.map((p) => ({ handle: p.handle, role: p.role, whyTh: truncate(p.whyTh, 300) }));
  const placeholderLines = Object.keys(placeholders).map((k) => `- {{metric:${k}}} = ${placeholders[k]} (${placeholderDocs[k] ?? k})`);
  return [
    `Brand:\n${JSON.stringify(brand)}`,
    `Plan built by code:\n${JSON.stringify(plan)}`,
    `Picks:\n${spotlight('picks', 'model_text', JSON.stringify(picks))}`,
    `Placeholders you may use (write the placeholder, never the value):\n${placeholderLines.join('\n')}`,
  ].join('\n\n');
}
