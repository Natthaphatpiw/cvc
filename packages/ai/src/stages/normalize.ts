import { InputBrief, type AudiencePersona, type RunInput } from '@cvc/schemas';
import { shouldStub } from '../env';
import { LlmBrief } from '../llm-schemas';
import { buildNormalizeUserContent, NORMALIZE_INSTRUCTIONS } from '../prompts/normalize';
import { generateStructured } from '../structured';
import { canonicalUrl, clamp, normalizeHandle, thaiShare, uniqText } from '../text';
import type { AiCtx } from '../types';

export type NormalizeExtras = { images: { url: string; mediaType: string; pathname: string }[]; personas: AudiencePersona[] };

export function missingFieldsFor(b: InputBrief): string[] {
  const missing: string[] = [];
  if (!b.urls.website) missing.push('websiteUrl');
  if (!b.urls.facebook) missing.push('facebookUrl');
  if (!b.urls.tiktok) missing.push('tiktokUrl');
  const t = b.targetAudience;
  if (t.personaIds.length === 0 && !t.freeText && !t.fromVoice && !t.fromImages) missing.push('targetAudience');
  if (!b.campaign.budgetTHB) missing.push('budgetTHB');
  return missing;
}

/** Heuristic completeness of the brief (0..1); not a model self-assessment. */
export function confidenceFor(b: InputBrief): number {
  let c = 0.3;
  if (b.urls.website) c += 0.15;
  if (b.urls.facebook) c += 0.1;
  if (b.urls.tiktok || b.urls.instagram || b.urls.youtube) c += 0.05;
  const t = b.targetAudience;
  if (t.personaIds.length > 0 || t.freeText || t.fromVoice) c += 0.2;
  if (b.campaign.budgetTHB) c += 0.1;
  if (b.imageFindings.length > 0) c += 0.05;
  if (b.voiceTranscript) c += 0.05;
  return Math.round(clamp(c, 0, 1) * 100) / 100;
}

/** Deterministic brief straight from the form. Used as the stub and as the base the LLM output is merged into. */
export function buildBaseBrief(input: RunInput): InputBrief {
  const name = input.companyName.trim();
  const voice = input.voiceTranscripts
    .map((v) => v.text.trim())
    .filter(Boolean)
    .join('\n\n');
  const brief: InputBrief = {
    company: { name, nameTh: thaiShare(name) >= 0.3 ? name : null, aliases: [] },
    urls: {
      website: canonicalUrl(input.websiteUrl),
      facebook: canonicalUrl(input.facebookUrl),
      tiktok: canonicalUrl(input.tiktokUrl),
      youtube: canonicalUrl(input.youtubeUrl),
      instagram: canonicalUrl(input.instagramUrl),
      others: [],
    },
    targetAudience: {
      personaIds: [...new Set(input.personaIds)],
      freeText: input.audienceNotes?.trim() || null,
      fromVoice: null,
      fromImages: null,
    },
    campaign: {
      objective: input.campaign.objective,
      budgetTHB: input.campaign.budgetTHB,
      nCreators: input.campaign.nCreators,
      preferredTiers: [...new Set(input.campaign.preferredTiers)],
    },
    constraints: {
      competitors: uniqText(input.exclusions.competitors),
      excludeHandles: [...new Set(input.exclusions.handles.map(normalizeHandle).filter(Boolean))],
      mustInclude: [],
    },
    imageFindings: [],
    voiceTranscript: voice || null,
    missingFields: [],
    confidence: 0,
  };
  brief.missingFields = missingFieldsFor(brief);
  brief.confidence = confidenceFor(brief);
  return brief;
}

/**
 * Merges LLM hints into the base brief. Form values win; a campaign hint only replaces a form value that is still at
 * its schema default (objective 'conversion', no budget, 5 creators, no tiers) because the form cannot tell whether
 * the user chose the default on purpose.
 */
export function mergeBriefHints(base: InputBrief, llm: LlmBrief, imagePathnames: readonly string[]): InputBrief {
  const h = llm.campaignHints;
  const budgetHint =
    h.budgetMinTHB != null || h.budgetMaxTHB != null
      ? (() => {
          const min = Math.max(0, h.budgetMinTHB ?? h.budgetMaxTHB ?? 0);
          const max = Math.max(min, h.budgetMaxTHB ?? h.budgetMinTHB ?? 0);
          return max > 0 ? { min, max } : null;
        })()
      : null;
  const nCreatorsHint = h.nCreators != null && h.nCreators >= 1 && h.nCreators <= 10 ? Math.round(h.nCreators) : null;
  const mainUrls = new Set(Object.values(base.urls).filter((u): u is string => typeof u === 'string'));
  const others = uniqText(llm.extraUrls.map((u) => canonicalUrl(u)).filter((u): u is string => u != null && !mainUrls.has(u)));
  const allowedPaths = new Set(imagePathnames);

  const merged: InputBrief = {
    ...base,
    company: {
      name: base.company.name,
      nameTh: base.company.nameTh ?? (llm.nameTh?.trim() || null),
      aliases: uniqText(llm.aliases).filter((a) => a.toLowerCase() !== base.company.name.toLowerCase()).slice(0, 10),
    },
    urls: { ...base.urls, others: uniqText([...base.urls.others, ...others]).slice(0, 10) },
    targetAudience: {
      personaIds: base.targetAudience.personaIds,
      freeText: base.targetAudience.freeText ?? (llm.audienceFreeText?.trim() || null),
      fromVoice: base.voiceTranscript ? llm.audienceFromVoice?.trim() || null : null,
      fromImages: imagePathnames.length ? llm.audienceFromImages?.trim() || null : null,
    },
    campaign: {
      objective: base.campaign.objective === 'conversion' && h.objective ? h.objective : base.campaign.objective,
      budgetTHB: base.campaign.budgetTHB ?? budgetHint,
      nCreators: base.campaign.nCreators === 5 && nCreatorsHint ? nCreatorsHint : base.campaign.nCreators,
      preferredTiers: base.campaign.preferredTiers.length ? base.campaign.preferredTiers : [...new Set(h.preferredTiers)],
    },
    constraints: {
      competitors: uniqText([...base.constraints.competitors, ...llm.extraCompetitors]).slice(0, 20),
      excludeHandles: base.constraints.excludeHandles,
      mustInclude: [...new Set(llm.mustInclude.map(normalizeHandle).filter((x) => /^[a-z0-9._]{2,40}$/.test(x)))].slice(0, 10),
    },
    imageFindings: llm.imageFindings
      .filter((f) => allowedPaths.has(f.assetPathname))
      .map((f) => ({ assetPathname: f.assetPathname, type: f.type, facts: uniqText(f.facts).slice(0, 12) }))
      .filter((f) => f.facts.length > 0),
  };
  merged.missingFields = missingFieldsFor(merged);
  merged.confidence = confidenceFor(merged);
  return merged;
}

/** LLM0: RunInput (+ screenshots, + personas) → InputBrief. */
export async function normalizeInput(input: RunInput, extras: NormalizeExtras, ctx?: AiCtx): Promise<InputBrief> {
  const base = buildBaseBrief(input);
  if (shouldStub('normalizeInput')) return InputBrief.parse(base);
  // Nothing for the model to read: the form fields are already in the base brief.
  if (!input.audienceNotes && input.voiceTranscripts.length === 0 && extras.images.length === 0) return InputBrief.parse(base);

  const pathnames = extras.images.map((i) => i.pathname);
  const { value } = await generateStructured({
    stage: 'llm0_normalize',
    tier: 'main',
    effort: 'low',
    instructions: NORMALIZE_INSTRUCTIONS,
    userContent: buildNormalizeUserContent({ input, personas: extras.personas, images: extras.images }),
    llmSchema: LlmBrief,
    toDomain: (raw) => mergeBriefHints(base, raw, pathnames),
    domainSchema: InputBrief,
    maxOutputTokens: 6_000,
    ctx,
  });
  return value;
}
