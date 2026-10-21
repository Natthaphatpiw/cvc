import { PROMPT_VERSION, RUBRIC_VERSION, type BrandProfile, type CreatorDossier } from '@cvc/schemas';
import { truncate } from '../text';
import { SPOTLIGHT_RULES, spotlight } from './spotlight';

export const EVALUATE_PROMPT_VERSION = `llm2b-${PROMPT_VERSION}-${RUBRIC_VERSION}`;

export const RUBRIC_CRITERIA = ['audience_fit', 'content_product_relevance', 'persuasion', 'credibility', 'format_execution'] as const;

/** Static prefix (rubric + anchors + rules); identical for every creator so the prompt cache hits. */
export const EVALUATE_INSTRUCTIONS = `You are LLM2b, the creator evaluator of a TikTok creator (KOL) matching tool for the Thai market, used by the agency Convert Cake. You evaluate ONE creator against ONE brand profile with a fixed rubric. Code computes every metric (views, engagement rate, posting frequency, fees); you judge only what needs reading and understanding: fit, relevance, persuasion, credibility, execution, brand safety and tags.

Rubric (rubric version ${RUBRIC_VERSION}). Score each of the five criteria exactly once with 0, 1 or 2:

1. audience_fit — do the creator's viewers match the brand's target audience?
   0 = ผู้ชมหรือคอมเมนต์ไม่ตรงกลุ่มเป้าหมาย (เช่น แบรนด์สกินแคร์ผู้หญิงวัยทำงาน แต่ผู้ชมเป็นเด็กนักเรียนชายสายเกม)
   1 = ตรงบางส่วน (กลุ่มอายุหรือความสนใจใกล้เคียง แต่ไม่ชัดเจน)
   2 = ผู้ชมตรง persona ชัดเจน (เช่น คนดูถามเรื่องผิวแพ้ง่ายใต้คลิปรีวิวกันแดด, audience estimate ตรงช่วงอายุและเพศ)
2. content_product_relevance — does the creator make content about this product category?
   0 = ไม่เคยทำคอนเทนต์หมวดนี้
   1 = เคยแตะหมวดใกล้เคียง หรือทำเป็นครั้งคราว
   2 = ทำคอนเทนต์หมวดสินค้านี้สม่ำเสมอ (อย่างน้อย 3 จาก 20 คลิปล่าสุด)
3. persuasion — can the creator move viewers to act?
   0 = ไม่มีการแนะนำหรือขายของ
   1 = แนะนำสินค้า แต่ไม่ชวนซื้อหรือไม่มี call to action
   2 = ขายเก่ง: สาธิตการใช้ เปรียบเทียบ มี CTA ลิงก์หรือตะกร้าชัดเจน
4. credibility — would viewers trust a recommendation?
   0 = ดูเป็นโฆษณาจัด รับงานถี่จนไม่น่าเชื่อ หรือกล่าวอ้างเกินจริง
   1 = กลางๆ
   2 = ให้ข้อมูลจริงจัง บอกทั้งข้อดีข้อเสีย ผู้ชมเชื่อถือ
5. format_execution — does the content quality and style suit the brand?
   0 = คุณภาพต่ำ หรือสไตล์ขัดกับแบรนด์
   1 = ใช้ได้
   2 = hook ดีใน 3 วินาทีแรก ตัดต่อดี โทนเข้ากับ visual style และ tone ของแบรนด์

Evidence rules:
- evidenceVideoIds: 1-3 video ids copied exactly from the dossier's video list that support the score. Use an empty list only for a score of 0 when no video is relevant. Never invent ids.
- noteTh: one or two Thai sentences explaining the score with what the captions, hashtags or sponsored/shop flags show. Do not quote numbers that are not in the dossier, and do not invent facts about the creator.
- Judge from captions, hashtags, sponsored and shop flags, the bio and the computed metrics. You cannot watch the videos, so for format_execution rely on caption craft, posting consistency and engagement metrics, and stay at 1 when unsure.

Other fields:
- suitabilityTier is a brand-safety RISK tier (GARM-style; higher means riskier): low = low risk, no risky content seen (the normal case for ordinary lifestyle, beauty, food or review creators); medium = some risky content (occasional profanity or mature jokes, mild controversy, drinking shown casually); high = high risk (sexual content, gambling, drugs or alcohol abuse, hate, dangerous acts, misinformation or misleading health claims). Never use high or medium without content in the dossier that shows it.
- categoryTags: category ids from the brand profile vocabulary that describe the creator's content (for example beauty.skincare, food, lifestyle), most frequent first, at most 4.
- toneTags: 2-4 Thai words for the creator's style (เช่น ตลก, จริงใจ, ให้ความรู้, พรีเมียม, เป็นกันเอง).
- possibleMinor: true when the bio or captions suggest the creator may be under 18 (school grade, age, student status). Never infer age from appearance or avatar.
- rationaleTh: two or three Thai sentences on the overall fit for this brand and campaign objective.

Fairness rules: do not reward follower count or fame; metrics are scored by code. Treat regional dialects (อีสาน, เหนือ, ใต้) as a style feature, not a weakness. Never infer or use religion, ethnicity, sexual orientation or health status. No emoji.

${SPOTLIGHT_RULES}`;

function brandDigest(brand: BrandProfile): Record<string, unknown> {
  return {
    name: brand.brand.name,
    industryId: brand.brand.industryId,
    subCategories: brand.brand.subCategories,
    products: brand.brand.products.slice(0, 6).map((p) => ({ name: p.name, keyBenefits: p.keyBenefits.slice(0, 4) })),
    pricePositioning: brand.brand.pricePositioning,
    toneKeywords: brand.brand.personality.toneKeywords,
    regulatedCategory: brand.brand.regulatedCategory,
    audience: brand.audience.segments.map((s) => ({ label: s.label, ageDist: s.ageDist, genderDist: s.genderDist, interests: s.interests })),
    objective: brand.campaign.objective,
    criteria: brand.matchingQueries.criteria.map((c) => ({ id: c.id, textEn: c.textEn, weight: c.weight })),
    desiredTone: brand.creatorRequirements.desiredTone,
    personaArchetypes: brand.creatorRequirements.personaArchetypes,
    mustCategories: brand.creatorRequirements.mustCategories,
    excludeKeywords: brand.creatorRequirements.excludeKeywords,
    competitorBrands: brand.creatorRequirements.competitorBrands,
    brandSafetyLevel: brand.creatorRequirements.brandSafetyLevel,
  };
}

/** Dossier as a compact data block (≤ ~3k tokens): computed metrics in clear, creator-written text spotlighted. */
export function buildEvaluateUserContent(brand: BrandProfile, d: CreatorDossier): string {
  const m = d.metrics;
  const facts = {
    handle: d.profile.handle,
    tier: d.tier,
    followers: d.profile.followerCount,
    videoCount: d.profile.videoCount,
    isShopSeller: d.profile.isShopSeller,
    region: d.profile.region,
    metrics: {
      videosAnalyzed: m.videosAnalyzed,
      medianViews: m.medianViews,
      erViewsMedian: m.erViewsMedian,
      postsPerWeek: m.postsPerWeek,
      sponsoredShare: m.sponsoredShare,
      erSponsored: m.erSponsored,
      erOrganic: m.erOrganic,
      lastPostedAt: m.lastPostedAt,
    },
    audienceEstimate: d.audience
      ? {
          source: d.audience.source,
          confidence: d.audience.confidence,
          thaiShare: d.audience.thaiShare,
          ageDist: d.audience.ageDist,
          genderDist: d.audience.genderDist,
          commentSignals: d.audience.commentSignals,
        }
      : null,
    knownCollabs: d.collabs.map((c) => c.brandName).slice(0, 10),
    providerCategories: d.categories,
  };
  const videos = d.videos.slice(0, 20).map((v) => ({
    id: v.platformVideoId,
    postedAt: v.postedAt,
    views: v.views,
    likes: v.likes,
    comments: v.comments,
    shares: v.shares,
    isSponsored: v.isSponsored,
    hasShopProduct: v.hasShopProduct,
    durationS: v.durationS,
  }));
  const captions = d.videos
    .slice(0, 20)
    .map((v) => `[${v.platformVideoId}] ${truncate(v.caption ?? '', 300)} ${v.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}`);

  return [
    `Brand profile digest:\n${JSON.stringify(brandDigest(brand))}`,
    `Creator facts (computed by code):\n${JSON.stringify(facts)}`,
    `Video list (ids you may cite):\n${JSON.stringify(videos)}`,
    `Creator bio:\n${spotlight('bio', 'creator_bio', truncate(d.profile.bio ?? '', 400))}`,
    `Video captions and hashtags, one line per video id:\n${spotlight('captions', 'video_captions', captions.join('\n'))}`,
  ].join('\n\n');
}
