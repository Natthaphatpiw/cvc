import { KolEvaluation, type BrandProfile, type CreatorDossier, type RubricScore } from '@cvc/schemas';
import { shouldStub } from '../env';
import { LlmEvaluation } from '../llm-schemas';
import { buildEvaluateUserContent, EVALUATE_INSTRUCTIONS } from '../prompts/evaluate';
import { generateStructured } from '../structured';
import { ALL_CRITERIA, buildStubEvaluation } from '../stubs/evaluate';
import { truncate, uniqText } from '../text';
import type { AiCtx } from '../types';

const toScore = (n: number): 0 | 1 | 2 => (n >= 2 ? 2 : n >= 1 ? 1 : 0);

/** Issues the repair turn should fix: missing criteria and video ids that are not in the dossier. */
export function evaluationIssues(e: KolEvaluation, videoIds: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  const present = new Set(e.rubric.map((r) => r.criterion));
  for (const c of ALL_CRITERIA) if (!present.has(c)) issues.push(`rubric: criterion ${c} is missing`);
  for (const r of e.rubric) {
    const bad = r.evidenceVideoIds.filter((id) => !videoIds.has(id));
    if (bad.length) issues.push(`rubric.${r.criterion}.evidenceVideoIds: ${bad.join(', ')} are not ids from the video list`);
  }
  return issues;
}

/** Drops invalid video ids and fills missing criteria from the heuristic stub (marked in noteTh). */
export function sanitizeEvaluation(e: KolEvaluation, brand: BrandProfile, d: CreatorDossier): KolEvaluation {
  const videoIds = new Set(d.videos.map((v) => v.platformVideoId));
  const byCriterion = new Map<string, RubricScore>();
  for (const r of e.rubric) {
    if (!byCriterion.has(r.criterion)) byCriterion.set(r.criterion, { ...r, evidenceVideoIds: r.evidenceVideoIds.filter((id) => videoIds.has(id)) });
  }
  let fallback: KolEvaluation | null = null;
  const rubric = ALL_CRITERIA.map((c) => {
    const found = byCriterion.get(c);
    if (found) return found;
    fallback ??= buildStubEvaluation(brand, d);
    const stub = fallback.rubric.find((r) => r.criterion === c);
    return { criterion: c, score: stub?.score ?? 1, evidenceVideoIds: stub?.evidenceVideoIds ?? [], noteTh: `(ประเมินด้วยกฎอัตโนมัติ) ${stub?.noteTh ?? ''}`.trim() };
  });
  return KolEvaluation.parse({ ...e, rubric });
}

/** LLM2b: one creator against the brand rubric (isolated, no tools). */
export async function evaluateCreator(brand: BrandProfile, d: CreatorDossier, ctx?: AiCtx): Promise<KolEvaluation> {
  if (shouldStub('evaluateCreator')) return buildStubEvaluation(brand, d);
  const videoIds = new Set(d.videos.map((v) => v.platformVideoId));
  const { value } = await generateStructured({
    stage: 'llm2b_evaluate',
    tier: 'main',
    effort: 'low',
    instructions: EVALUATE_INSTRUCTIONS,
    userContent: buildEvaluateUserContent(brand, d),
    llmSchema: LlmEvaluation,
    toDomain: (raw): KolEvaluation => ({
      creatorId: d.creatorId,
      handle: d.profile.handle,
      rubric: raw.rubric.map((r) => ({
        criterion: r.criterion,
        score: toScore(r.score),
        evidenceVideoIds: uniqText(r.evidenceVideoIds).slice(0, 5),
        noteTh: truncate(r.noteTh, 400),
      })),
      suitabilityTier: raw.suitabilityTier,
      categoryTags: uniqText(raw.categoryTags).slice(0, 4),
      toneTags: uniqText(raw.toneTags).slice(0, 4),
      possibleMinor: raw.possibleMinor,
      rationaleTh: truncate(raw.rationaleTh, 800),
    }),
    domainSchema: KolEvaluation,
    check: (e) => evaluationIssues(e, videoIds),
    maxOutputTokens: 6_000,
    ctx,
  });
  return sanitizeEvaluation(value, brand, d);
}
