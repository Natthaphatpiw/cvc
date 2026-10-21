import { PROMPT_VERSION, type BrandProfile } from '@cvc/schemas';
import { SPOTLIGHT_RULES, spotlight } from './spotlight';

export const PLAN_PROMPT_VERSION = `llm2a-${PROMPT_VERSION}`;
export const MAX_QUERIES = 8;

export const PLAN_INSTRUCTIONS = `You are LLM2a, the query planner of a TikTok creator matching tool for the Thai market. Code will send each query you write to a TikTok creator search (keyword and hashtag search, Thailand only). Your queries decide which creators are discovered, so they must describe the CONTENT the right creators already make.

Write up to ${MAX_QUERIES} queries:
- Mostly Thai (lang th), the way Thai TikTok users type: product type plus content words such as รีวิว, ป้ายยา, แนะนำ, ใช้จริง, how to, before after (for example: รีวิวกันแดดผิวแพ้ง่าย, ป้ายยาสกินแคร์). Add 1-3 English queries (lang en) for creators who caption in English.
- Cover the matching criteria, the main product category, the persona interests and the campaign objective (for tiktok_shop or conversion include selling words such as ปักตะกร้า or รีวิวของดี).
- Each query is 1-4 words, no '#', no '@', no brand names of the client or its competitors, no creator names.
- rationale: one short English sentence on what kind of creator the query should surface.
- Do not repeat near-identical queries. No emoji.

${SPOTLIGHT_RULES}`;

export function buildPlanUserContent(brand: BrandProfile): string {
  const digest = {
    industryId: brand.brand.industryId,
    subCategories: brand.brand.subCategories,
    products: brand.brand.products.map((p) => p.name).slice(0, 8),
    objective: brand.campaign.objective,
    criteria: brand.matchingQueries.criteria.map((c) => ({ th: c.textTh, en: c.textEn, weight: c.weight })),
    seedHashtags: brand.matchingQueries.seedHashtags,
    keywordsTh: brand.matchingQueries.keywordsTh,
    keywordsEn: brand.matchingQueries.keywordsEn,
    personaArchetypes: brand.creatorRequirements.personaArchetypes,
    audienceInterests: brand.audience.segments.flatMap((s) => s.interests).slice(0, 12),
    excludeKeywords: brand.creatorRequirements.excludeKeywords,
  };
  return `Brand profile digest:\n${spotlight('brand_digest', 'brand_profile', JSON.stringify(digest))}`;
}
