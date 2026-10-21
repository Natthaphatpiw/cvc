import type { BrandProfile } from '@cvc/schemas';
import { z } from 'zod';
import { categoryKeywords, categoryLabel } from '../categories';
import { shouldStub } from '../env';
import { LlmQueryPlan } from '../llm-schemas';
import { buildPlanUserContent, MAX_QUERIES, PLAN_INSTRUCTIONS } from '../prompts/plan';
import { generateStructured } from '../structured';
import { truncate } from '../text';
import type { AiCtx } from '../types';

export type QueryPlan = { queries: { keyword: string; lang: 'th' | 'en'; rationale: string }[] };

const QueryPlanSchema = z.object({
  queries: z.array(z.object({ keyword: z.string().min(1).max(60), lang: z.enum(['th', 'en']), rationale: z.string() })).max(MAX_QUERIES),
});

const isThai = (s: string): boolean => /[฀-๿]/.test(s);

/** Trim, drop '#'/'@', dedupe case-insensitively, cap at MAX_QUERIES. */
export function cleanQueries(queries: QueryPlan['queries']): QueryPlan['queries'] {
  const seen = new Set<string>();
  const out: QueryPlan['queries'] = [];
  for (const q of queries) {
    const keyword = q.keyword.replace(/[#@]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const key = keyword.toLowerCase().replace(/\s+/g, '');
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    out.push({ keyword, lang: isThai(keyword) ? 'th' : 'en', rationale: truncate(q.rationale, 200) });
    if (out.length >= MAX_QUERIES) break;
  }
  return out;
}

/** Deterministic queries from the category vocabulary, persona interests and the brand's own keywords. */
export function stubQueries(brand: BrandProfile): QueryPlan {
  const label = categoryLabel(brand.brand.industryId);
  const catKws = categoryKeywords(brand.brand.industryId);
  const interests = brand.audience.segments.flatMap((s) => s.interests);
  const th = [
    ...brand.matchingQueries.keywordsTh,
    `รีวิว${label.th}`,
    ...catKws.filter(isThai).map((k) => (k.startsWith('รีวิว') ? k : `รีวิว${k}`)),
    ...interests.filter(isThai),
  ].map((keyword) => ({ keyword, lang: 'th' as const, rationale: 'คีย์เวิร์ดภาษาไทยจากหมวดสินค้าและกลุ่มเป้าหมาย' }));
  const en = [
    ...brand.matchingQueries.keywordsEn,
    `${label.en.toLowerCase()} review`,
    ...catKws.filter((k) => !isThai(k)),
    ...interests.filter((k) => !isThai(k)),
  ].map((keyword) => ({ keyword, lang: 'en' as const, rationale: 'English keyword from the product category and persona interests' }));
  // Mostly Thai: up to 6 Thai queries, then English.
  const thai = cleanQueries(th).slice(0, 6);
  const english = cleanQueries(en).slice(0, MAX_QUERIES - thai.length);
  return { queries: cleanQueries([...thai, ...english]) };
}

/** LLM2a: BrandProfile → ≤ 8 discovery queries (code calls the providers). */
export async function planQueries(brand: BrandProfile, ctx?: AiCtx): Promise<QueryPlan> {
  if (shouldStub('planQueries')) return stubQueries(brand);
  const { value } = await generateStructured({
    stage: 'llm2a_plan',
    tier: 'main',
    effort: 'medium',
    instructions: PLAN_INSTRUCTIONS,
    userContent: buildPlanUserContent(brand),
    llmSchema: LlmQueryPlan,
    toDomain: (raw): QueryPlan => ({ queries: cleanQueries(raw.queries) }),
    domainSchema: QueryPlanSchema,
    maxOutputTokens: 3_000,
    ctx,
  });
  return value.queries.length > 0 ? value : stubQueries(brand);
}
