import { CuratorOutput, PortfolioNarrative } from '@cvc/schemas';
import { shouldStub } from '../env';
import { fmtCpv, fmtNumber, fmtPct, fmtScore, fmtTHBRange } from '../format';
import { LlmCuratorOutput, LlmPortfolioNarrative } from '../llm-schemas';
import { buildCurateCreatorUserContent, buildCuratePortfolioUserContent, CURATE_CREATOR_INSTRUCTIONS, CURATE_PORTFOLIO_INSTRUCTIONS } from '../prompts/curate';
import { generateStructured } from '../structured';
import { buildStubCuratorOutput, buildStubPortfolioNarrative, storylineFormat, type CurateCreatorArgs, type CuratePortfolioArgs } from '../stubs/curate';
import { truncate, uniqText } from '../text';
import type { AiCtx } from '../types';

const PLACEHOLDER_RE = /\{\{\s*metric:([a-z0-9_]+)\s*\}\}/gi;
/** Numbers the narrative must not contain outside placeholders: 2+ digits, decimals, percentages. */
const RAW_NUMBER_RE = /\d[\d,]*\.\d+|\d{2,}|\d+\s*%/g;
const DISCLOSURE = '#โฆษณา';

type Placeholders = { values: Record<string, string>; docs: Record<string, string> };

/** The n keys with the largest shares, for example '25-34, 18-24'. */
function topKeys(dist: Record<string, number> | null | undefined, n = 2): string {
  if (!dist) return '–';
  const keys = Object.entries(dist)
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([key]) => key);
  return keys.length ? keys.join(', ') : '–';
}

export function creatorPlaceholders(a: CurateCreatorArgs): Placeholders {
  const m = a.dossier.metrics;
  const k = a.kpis;
  const g = a.ranked.groups;
  const entries: [string, string, string][] = [
    ['followers', fmtNumber(a.dossier.profile.followerCount), 'follower count'],
    ['median_views', fmtNumber(m.medianViews), 'median views per video (recent videos)'],
    ['er', fmtPct(m.erViewsMedian), 'median engagement rate by views'],
    ['posts_per_week', fmtNumber(m.postsPerWeek, 1), 'posts per week'],
    ['videos_analyzed', fmtNumber(m.videosAnalyzed), 'number of recent videos analyzed'],
    ['sponsored_videos', fmtNumber(m.sponsoredCount), 'sponsored videos among them'],
    ['sponsored_share', fmtPct(m.sponsoredShare, 0), 'share of sponsored videos'],
    ['expected_views_p25', fmtNumber(k.perPost.views.p25), 'expected views per post, low case (estimate)'],
    ['expected_views_p50', fmtNumber(k.perPost.views.p50), 'expected views per post, middle case (estimate)'],
    ['expected_views_p75', fmtNumber(k.perPost.views.p75), 'expected views per post, high case (estimate)'],
    ['expected_er', fmtPct(k.perPost.erViews), 'expected engagement rate (estimate)'],
    ['expected_engagements_p50', fmtNumber(k.perPost.engagements.p50), 'expected engagements per post (estimate)'],
    ['fee_range', fmtTHBRange(k.cost.feeTHB), 'estimated fee per post in THB'],
    ['cpv_p50', k.cost.cpv ? fmtCpv(k.cost.cpv.p50) : '–', 'expected cost per view in THB (estimate)'],
    ['total_score', fmtNumber(a.ranked.total), 'overall match score out of 100'],
    ['rank', fmtNumber(a.ranked.rank), 'rank in this shortlist'],
    ['fit_score', fmtScore(g.fit), 'fit group score out of 100'],
    ['audience_score', fmtScore(g.audience), 'audience group score out of 100'],
    ['performance_score', fmtScore(g.performance), 'performance group score out of 100'],
    ['trust_score', fmtScore(g.trust), 'trust group score out of 100'],
    ['cost_score', fmtScore(g.cost), 'cost group score out of 100'],
  ];
  if (k.conversion) {
    entries.push(['expected_orders_p50', fmtNumber(k.conversion.orders.p50), 'expected orders per post (estimate)']);
    entries.push(['expected_clicks_p50', fmtNumber(k.conversion.clicks.p50), 'expected clicks per post (estimate)']);
  }
  // Audience overlap for fitSummaryTh: age bands and shares would otherwise be raw numbers in the text.
  const aud = a.dossier.audience;
  if (aud) {
    const female = aud.genderDist ? (aud.genderDist.female ?? aud.genderDist.f ?? null) : null;
    entries.push(['audience_age_top', topKeys(aud.ageDist), "most common age bands of the creator's viewers (estimate)"]);
    entries.push(['audience_female_share', fmtPct(female, 0), 'share of female viewers (estimate)']);
    entries.push(['audience_thai_share', fmtPct(aud.thaiShare, 0), 'share of Thai viewers (estimate)']);
    if (aud.commentSignals) entries.push(['audience_buy_intent', fmtPct(aud.commentSignals.buyIntentShare, 0), 'share of comments that show buying intent (estimate)']);
  }
  const segment = a.brand.audience.segments[0];
  if (segment) entries.push(['brand_age_top', topKeys(segment.ageDist), "main age bands of the brand's first target segment"]);
  return { values: Object.fromEntries(entries.map(([key, v]) => [key, v])), docs: Object.fromEntries(entries.map(([key, , d]) => [key, d])) };
}

export function portfolioPlaceholders(a: CuratePortfolioArgs): Placeholders {
  const t = a.plan.totals;
  const entries: [string, string, string][] = [
    ['n_creators', fmtNumber(a.picks.length), 'number of creators'],
    ['total_fee', fmtTHBRange(t.feeTHB), 'total estimated fees in THB'],
    ['total_views_p50', fmtNumber(t.views.p50), 'expected total views, middle case (estimate)'],
    ['total_views_range', `${fmtNumber(t.views.p25)}–${fmtNumber(t.views.p75)}`, 'expected total views, low to high case (estimate)'],
    ['total_engagements_p50', fmtNumber(t.engagements.p50), 'expected total engagements (estimate)'],
    ['budget', fmtTHBRange(a.brand.campaign.budgetTHB), 'client budget in THB'],
  ];
  if (t.orders) entries.push(['total_orders_p50', fmtNumber(t.orders.p50), 'expected total orders (estimate)']);
  if (t.clicks) entries.push(['total_clicks_p50', fmtNumber(t.clicks.p50), 'expected total clicks (estimate)']);
  return { values: Object.fromEntries(entries.map(([key, v]) => [key, v])), docs: Object.fromEntries(entries.map(([key, , d]) => [key, d])) };
}

/** Replaces {{metric:name}} with the computed value; unknown names become '–'. */
export function fillMetricPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (_m, name: string) => values[name.toLowerCase()] ?? '–');
}

/**
 * Rule violations in model text: raw numbers outside placeholders and unknown placeholder names. `literals` are names
 * the text may quote verbatim (segment labels such as วัยเกษียณ/50+, the @handle); their digits are not metrics.
 */
export function narrativeIssues(texts: { path: string; text: string }[], values: Record<string, string>, literals: string[] = []): string[] {
  const issues: string[] = [];
  for (const { path, text } of texts) {
    for (const m of text.matchAll(PLACEHOLDER_RE)) {
      const name = (m[1] ?? '').toLowerCase();
      if (!(name in values)) issues.push(`${path}: unknown placeholder {{metric:${name}}}`);
    }
    let scrubbed = text.replace(PLACEHOLDER_RE, ' ');
    for (const l of literals) if (l) scrubbed = scrubbed.split(l).join(' ');
    const raw = scrubbed.match(RAW_NUMBER_RE);
    if (raw?.length) issues.push(`${path}: contains raw numbers (${raw.slice(0, 3).join(', ')}); use placeholders instead`);
  }
  return issues;
}

function curatorTexts(o: LlmCuratorOutput | CuratorOutput): { path: string; text: string }[] {
  const p = o.playbookText;
  return [
    ...o.whyMatchTh.map((w, i) => ({ path: `whyMatchTh.${i}`, text: w.text })),
    ...o.risksTh.map((t, i) => ({ path: `risksTh.${i}`, text: t })),
    { path: 'fitSummaryTh', text: o.fitSummaryTh },
    { path: 'storyline.conceptTh', text: o.storyline.conceptTh },
    { path: 'storyline.ctaTh', text: o.storyline.ctaTh },
    ...o.pitchAnglesTh.map((t, i) => ({ path: `pitchAnglesTh.${i}`, text: t })),
    ...o.topVideoNotes.map((t, i) => ({ path: `topVideoNotes.${i}.whyTh`, text: t.whyTh })),
    { path: 'playbookText.roleReasonTh', text: p.roleReasonTh },
    { path: 'playbookText.collaborationNoteTh', text: p.collaborationNoteTh },
    ...p.contentAnglesTh.map((t, i) => ({ path: `playbookText.contentAnglesTh.${i}`, text: t })),
    ...p.negotiationTh.map((t, i) => ({ path: `playbookText.negotiationTh.${i}`, text: t })),
    ...p.riskMitigations.flatMap((r, i) => [
      { path: `playbookText.riskMitigations.${i}.riskTh`, text: r.riskTh },
      { path: `playbookText.riskMitigations.${i}.mitigationTh`, text: r.mitigationTh },
    ]),
  ];
}

/**
 * Maps model output to CuratorOutput: fills placeholders, keeps only evidence refs that exist (brand evidence refs or
 * dossier video ids), forces the ad disclosure.
 */
export function mapCuratorOutput(raw: LlmCuratorOutput, a: CurateCreatorArgs, values: Record<string, string>): CuratorOutput {
  const fill = (s: string, max = 600): string => truncate(fillMetricPlaceholders(s, values), max);
  const videoIds = new Set(a.dossier.videos.map((v) => v.platformVideoId));
  const allowedRefs = new Set([...a.brand.evidence.map((e) => e.ref), ...videoIds]);
  const caption = fill(raw.storyline.sampleCaptionTh, 400);
  return {
    creatorId: a.dossier.creatorId,
    whyMatchTh: raw.whyMatchTh.slice(0, 5).map((w) => ({ text: fill(w.text), evidenceRefs: uniqText(w.evidenceRefs.filter((r) => allowedRefs.has(r.trim())).map((r) => r.trim())) })),
    risksTh: raw.risksTh.slice(0, 5).map((t) => fill(t)),
    fitSummaryTh: fill(raw.fitSummaryTh, 900),
    storyline: {
      conceptTh: fill(raw.storyline.conceptTh),
      hookTh: fill(raw.storyline.hookTh, 300),
      format: raw.storyline.format ?? storylineFormat(a.hints),
      ctaTh: fill(raw.storyline.ctaTh, 200),
      sampleCaptionTh: caption.includes(DISCLOSURE) ? caption : `${caption} ${DISCLOSURE}`.trim(),
      disclosure: raw.storyline.disclosure.includes(DISCLOSURE) ? raw.storyline.disclosure.trim() : DISCLOSURE,
    },
    pitchAnglesTh: raw.pitchAnglesTh.slice(0, 4).map((t) => fill(t)),
    topVideoNotes: raw.topVideoNotes.filter((n) => videoIds.has(n.videoId.trim())).slice(0, 3).map((n) => ({ videoId: n.videoId.trim(), whyTh: fill(n.whyTh, 300) })),
    playbookText: {
      roleReasonTh: fill(raw.playbookText.roleReasonTh),
      collaborationNoteTh: fill(raw.playbookText.collaborationNoteTh),
      contentAnglesTh: raw.playbookText.contentAnglesTh.slice(0, 5).map((t) => fill(t, 300)),
      briefDosTh: raw.playbookText.briefDosTh.slice(0, 5).map((t) => fill(t, 300)),
      briefDontsTh: raw.playbookText.briefDontsTh.slice(0, 5).map((t) => fill(t, 300)),
      negotiationTh: raw.playbookText.negotiationTh.slice(0, 4).map((t) => fill(t, 300)),
      riskMitigations: raw.playbookText.riskMitigations.slice(0, 5).map((r) => ({ riskTh: fill(r.riskTh, 300), mitigationTh: fill(r.mitigationTh, 300) })),
    },
  };
}

/** LLM4 per creator: narrative only; numbers come from code through placeholders. */
export async function curateCreator(a: CurateCreatorArgs, ctx?: AiCtx): Promise<CuratorOutput> {
  if (shouldStub('curateCreator')) return buildStubCuratorOutput(a);
  const { values, docs } = creatorPlaceholders(a);
  // Raw-number violations are detected on the model text before placeholders are filled.
  let lastRaw: LlmCuratorOutput | null = null;
  const { value } = await generateStructured({
    stage: 'llm4_curate_creator',
    tier: 'main',
    effort: 'medium',
    instructions: CURATE_CREATOR_INSTRUCTIONS,
    userContent: buildCurateCreatorUserContent(a, values, docs),
    llmSchema: LlmCuratorOutput,
    toDomain: (raw) => {
      lastRaw = raw;
      return mapCuratorOutput(raw, a, values);
    },
    domainSchema: CuratorOutput,
    check: () =>
      lastRaw ? narrativeIssues(curatorTexts(lastRaw), values, [...a.brand.audience.segments.map((s) => s.label), `@${a.dossier.profile.handle}`]) : [],
    maxOutputTokens: 10_000,
    ctx,
  });
  return value;
}

/** LLM4 portfolio narrative over the code-built plan. */
export async function curatePortfolio(a: CuratePortfolioArgs, ctx?: AiCtx): Promise<PortfolioNarrative> {
  if (shouldStub('curatePortfolio')) return buildStubPortfolioNarrative(a);
  const { values, docs } = portfolioPlaceholders(a);
  let lastRaw: LlmPortfolioNarrative | null = null;
  const { value } = await generateStructured({
    stage: 'llm4_curate_portfolio',
    tier: 'main',
    effort: 'medium',
    instructions: CURATE_PORTFOLIO_INSTRUCTIONS,
    userContent: buildCuratePortfolioUserContent(a, values, docs),
    llmSchema: LlmPortfolioNarrative,
    toDomain: (raw): PortfolioNarrative => {
      lastRaw = raw;
      const fill = (s: string, max = 800): string => truncate(fillMetricPlaceholders(s, values), max);
      return {
        headlineTh: fill(raw.headlineTh, 300),
        consultantSummaryTh: fill(raw.consultantSummaryTh, 1_500),
        mixTh: fill(raw.mixTh, 600),
        nextStepsTh: raw.nextStepsTh.slice(0, 6).map((s) => fill(s, 300)),
      };
    },
    domainSchema: PortfolioNarrative,
    check: () => {
      const r: LlmPortfolioNarrative | null = lastRaw;
      if (!r) return [];
      return narrativeIssues(
        [
          { path: 'headlineTh', text: r.headlineTh },
          { path: 'consultantSummaryTh', text: r.consultantSummaryTh },
          { path: 'mixTh', text: r.mixTh },
          ...r.nextStepsTh.map((t, i) => ({ path: `nextStepsTh.${i}`, text: t })),
        ],
        values,
      );
    },
    maxOutputTokens: 4_000,
    ctx,
  });
  return value;
}

export type { CurateCreatorArgs, CuratePortfolioArgs };
