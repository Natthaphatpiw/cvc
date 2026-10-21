import { openai } from '@ai-sdk/openai';
import { BrandProfile } from '@cvc/schemas';
import type { ToolSet } from 'ai';
import { followerRangeForTiers, guessCategory } from '../categories';
import { shouldStub } from '../env';
import type { LlmBrandProfile } from '../llm-schemas';
import { LlmBrandProfile as LlmBrandProfileSchema, LlmDistribution } from '../llm-schemas';
import { supportsOpenAiTools } from '../models';
import { buildBrandInstructions, buildBrandUserContent, evidenceRef } from '../prompts/brand';
import { generateStructured } from '../structured';
import { brandSignalTexts, buildStubBrandProfile, selectedPersonas, unavailableSources, type ResearchBrandArgs } from '../stubs/brand';
import { canonicalUrl, clamp, normalizeHandle, tiktokHandleFromUrl, truncate, uniqText } from '../text';
import type { AiCtx } from '../types';

type Dist = typeof LlmDistribution._output;

/** key/share pairs → record normalized to sum 1 (empty record when nothing usable). */
export function distToRecord(entries: Dist, keyMap: (k: string) => string = (k) => k.trim()): Record<string, number> {
  const acc = new Map<string, number>();
  for (const e of entries) {
    const key = keyMap(e.key);
    if (!key || !Number.isFinite(e.share) || e.share <= 0) continue;
    acc.set(key, (acc.get(key) ?? 0) + e.share);
  }
  const total = [...acc.values()].reduce((s, x) => s + x, 0);
  if (total <= 0) return {};
  return Object.fromEntries([...acc.entries()].map(([k, v]) => [k, Math.round((v / total) * 10_000) / 10_000]));
}

const genderKey = (k: string): string => {
  const t = k.trim().toLowerCase();
  if (t.startsWith('f') || t === 'หญิง' || t === 'ผู้หญิง') return 'female';
  if (t.startsWith('m') || t === 'ชาย' || t === 'ผู้ชาย') return 'male';
  return t;
};

/**
 * Maps the strict LLM shape to BrandProfile. Code owns name/URLs/campaign/scoring preset/minors; ids are checked
 * against the category list; empty criteria or segments fall back to the deterministic stub so the profile stays valid.
 * Web evidence keeps any http(s) URL here; researchBrand() drops URLs that web_search did not return.
 */
export function mapLlmBrandProfile(raw: LlmBrandProfile, a: ResearchBrandArgs): BrandProfile {
  const { brief } = a;
  let stub: BrandProfile | null = null;
  const stubProfile = (): BrandProfile => (stub ??= buildStubBrandProfile(a));
  const ids = new Set(a.categories.map((c) => c.id));
  const validCat = (id: string | null): string | null => (id && ids.has(id.trim()) ? id.trim() : null);
  const fallbackCategory = guessCategory(brandSignalTexts(brief, a.evidence), a.categories, selectedPersonas(brief, a.personas));
  const industryId = validCat(raw.brand.industryId) ?? fallbackCategory.id;

  const criteriaRaw = raw.matchingQueries.criteria.filter((c) => c.textTh.trim() && Number.isFinite(c.weight) && c.weight > 0).slice(0, 6);
  const weightSum = criteriaRaw.reduce((s, c) => s + c.weight, 0);
  const criteriaMapped = criteriaRaw.map((c, i) => ({
    id: `c${i + 1}`,
    textTh: truncate(c.textTh, 200),
    textEn: truncate(c.textEn || c.textTh, 200),
    weight: Math.round((c.weight / weightSum) * 1000) / 1000,
  }));
  const criteria = criteriaMapped.length ? criteriaMapped : stubProfile().matchingQueries.criteria;

  const now = new Date().toISOString();
  const evidence = raw.evidence
    .map((e) => {
      const m = /^E(\d+)$/i.exec(e.ref.trim());
      const card = m ? a.evidence[Number(m[1]) - 1] : undefined;
      if (card) {
        return card.sourceUrl ? { ref: evidenceRef(Number(m?.[1]) - 1), claim: truncate(e.claim, 300), url: card.sourceUrl, retrievedAt: now } : null;
      }
      const url = e.url && canonicalUrl(e.url) ? e.url.trim() : null;
      return url ? { ref: e.ref.trim().slice(0, 10) || 'W', claim: truncate(e.claim, 300), url, retrievedAt: now } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .slice(0, 12);

  const llmFollowers = raw.creatorRequirements.followers;
  const followers =
    brief.campaign.preferredTiers.length > 0
      ? followerRangeForTiers(brief.campaign.preferredTiers)
      : Number.isFinite(llmFollowers.min) && Number.isFinite(llmFollowers.max) && llmFollowers.max > llmFollowers.min
        ? { min: Math.max(1_000, Math.round(llmFollowers.min)), max: Math.round(llmFollowers.max) }
        : followerRangeForTiers([]);

  const segmentsMapped = raw.audience.segments.slice(0, 6).map((s) => ({
    label: truncate(s.label, 120),
    ageDist: distToRecord(s.ageDist),
    genderDist: distToRecord(s.genderDist, genderKey),
    regionDist: distToRecord(s.regionDist),
    interests: uniqText(s.interests).slice(0, 10),
    painPoints: uniqText(s.painPoints).slice(0, 8),
    purchaseDrivers: uniqText(s.purchaseDrivers).slice(0, 8),
  }));
  const segments = segmentsMapped.length ? segmentsMapped : stubProfile().audience.segments;

  return {
    schemaVersion: '1.0',
    brand: {
      name: brief.company.name,
      website: brief.urls.website,
      facebookUrl: brief.urls.facebook,
      tiktokHandle: tiktokHandleFromUrl(brief.urls.tiktok),
      industryId,
      subCategories: uniqText(raw.brand.subCategories).slice(0, 8),
      products: raw.brand.products.slice(0, 12).map((p) => {
        const band = p.priceBandTHB;
        const okBand = band && Number.isFinite(band.min) && Number.isFinite(band.max) && band.min >= 0 && band.max >= band.min;
        return {
          name: truncate(p.name, 120),
          categoryId: validCat(p.categoryId),
          priceBandTHB: okBand ? ([band.min, band.max] as [number, number]) : null,
          keyBenefits: uniqText(p.keyBenefits).slice(0, 6),
          usp: p.usp ? truncate(p.usp, 200) : null,
        };
      }),
      pricePositioning: raw.brand.pricePositioning,
      personality: {
        toneKeywords: uniqText(raw.brand.personality.toneKeywords).slice(0, 8),
        formality: clamp(raw.brand.personality.formality, 0, 1),
        humor: clamp(raw.brand.personality.humor, 0, 1),
        energy: clamp(raw.brand.personality.energy, 0, 1),
      },
      languageStyle: { primary: raw.brand.languageStyle.primary.trim() || 'th', englishMix: raw.brand.languageStyle.englishMix, register: raw.brand.languageStyle.register },
      contentPillars: uniqText(raw.brand.contentPillars).slice(0, 8),
      visualStyle: uniqText(raw.brand.visualStyle).slice(0, 8),
      regulatedCategory: raw.brand.regulatedCategory,
    },
    audience: { segments, source: raw.audience.source, confidence: clamp(raw.audience.confidence, 0, 1) },
    contentStyle: {
      formats: uniqText(raw.contentStyle.formats).slice(0, 6),
      hooks: uniqText(raw.contentStyle.hooks).slice(0, 6),
      themes: uniqText(raw.contentStyle.themes).slice(0, 8),
      fbEngagement: {
        medianER: raw.contentStyle.fbEngagement.medianER != null && Number.isFinite(raw.contentStyle.fbEngagement.medianER) ? raw.contentStyle.fbEngagement.medianER : null,
        postsPerWeek: raw.contentStyle.fbEngagement.postsPerWeek != null && Number.isFinite(raw.contentStyle.fbEngagement.postsPerWeek) ? raw.contentStyle.fbEngagement.postsPerWeek : null,
      },
    },
    // Campaign facts come from the brief (code), only KPI names and formats from the model.
    campaign: {
      objective: brief.campaign.objective,
      kpis: uniqText(raw.campaign.kpis).slice(0, 6),
      budgetTHB: brief.campaign.budgetTHB,
      nCreators: brief.campaign.nCreators,
      preferredTiers: brief.campaign.preferredTiers,
      formats: uniqText(raw.campaign.formats).slice(0, 4),
    },
    creatorRequirements: {
      mustCategories: uniqText(raw.creatorRequirements.mustCategories.map((c) => validCat(c) ?? '')).slice(0, 4),
      niceCategories: uniqText(raw.creatorRequirements.niceCategories.map((c) => validCat(c) ?? '')).slice(0, 6),
      desiredTone: uniqText(raw.creatorRequirements.desiredTone).slice(0, 6),
      personaArchetypes: uniqText(raw.creatorRequirements.personaArchetypes).slice(0, 6),
      followers,
      minMedianViews:
        raw.creatorRequirements.minMedianViews != null && Number.isFinite(raw.creatorRequirements.minMedianViews) && raw.creatorRequirements.minMedianViews > 0
          ? Math.round(raw.creatorRequirements.minMedianViews)
          : null,
      languages: uniqText(raw.creatorRequirements.languages).slice(0, 4),
      dialects: uniqText(raw.creatorRequirements.dialects).slice(0, 4),
      excludeKeywords: uniqText(raw.creatorRequirements.excludeKeywords).slice(0, 20),
      excludeHandles: [...new Set([...brief.constraints.excludeHandles, ...raw.creatorRequirements.excludeHandles.map(normalizeHandle)].filter(Boolean))],
      competitorBrands: uniqText([...brief.constraints.competitors, ...raw.creatorRequirements.competitorBrands]).slice(0, 20),
      exclusivityWindowDays: Math.round(clamp(raw.creatorRequirements.exclusivityWindowDays || 90, 0, 365)),
      brandSafetyLevel: raw.creatorRequirements.brandSafetyLevel,
      // Responsible AI (§13.4): minors are excluded by default regardless of model output.
      allowMinors: false,
    },
    matchingQueries: {
      criteria,
      seedHashtags: uniqText(raw.matchingQueries.seedHashtags.map((h) => h.replace(/^#/, '').replace(/\s+/g, ''))).slice(0, 10),
      keywordsTh: uniqText(raw.matchingQueries.keywordsTh).slice(0, 10),
      keywordsEn: uniqText(raw.matchingQueries.keywordsEn).slice(0, 8),
    },
    scoringPreset: brief.campaign.objective,
    evidence,
    sourcesUnavailable: uniqText([...unavailableSources(brief, a.evidence), ...raw.sourcesUnavailable]).slice(0, 10),
    unknowns: uniqText(raw.unknowns).slice(0, 10),
    confidence: clamp(raw.confidence, 0, 1),
  };
}

/** LLM1: brief + evidence cards (+ optional OpenAI web_search) → BrandProfile. */
export async function researchBrand(a: ResearchBrandArgs, ctx?: AiCtx): Promise<BrandProfile> {
  if (shouldStub('researchBrand')) return buildStubBrandProfile(a);

  const webSearch = a.allowWebSearch && supportsOpenAiTools();
  const tools: ToolSet | undefined = webSearch
    ? {
        web_search: openai.tools.webSearch({
          searchContextSize: 'medium',
          userLocation: { type: 'approximate', country: 'TH', timezone: 'Asia/Bangkok' },
        }),
      }
    : undefined;

  const { value, sourceUrls } = await generateStructured<LlmBrandProfile, BrandProfile>({
    stage: 'llm1_brand',
    tier: 'main',
    effort: 'medium',
    instructions: buildBrandInstructions(webSearch),
    userContent: buildBrandUserContent({ brief: a.brief, evidence: a.evidence, personas: a.personas, categories: a.categories }),
    llmSchema: LlmBrandProfileSchema,
    toDomain: (raw) => mapLlmBrandProfile(raw, a),
    domainSchema: BrandProfile,
    tools,
    maxToolCalls: webSearch ? 8 : undefined,
    maxOutputTokens: 16_000,
    ctx,
  });
  // Drop web evidence whose URL did not come back from web_search (no invented sources).
  const urls = new Set(sourceUrls);
  const cardUrls = new Set(a.evidence.map((e) => e.sourceUrl).filter((u): u is string => u != null));
  const evidence = value.evidence.filter((e) => cardUrls.has(e.url) || urls.has(e.url));
  return BrandProfile.parse({ ...value, evidence });
}

export type { ResearchBrandArgs };
