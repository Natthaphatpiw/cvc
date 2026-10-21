import { KolEvaluation, REF_SEED, type BrandProfile, type CreatorDossier, type RubricCriterion, type RubricScore, type SuitabilityTier } from '@cvc/schemas';
import { categoryKeywords, matchCategories } from '../categories';
import { fmtPct } from '../format';
import { hasKeyword, uniqText, videoText } from '../text';

const CTA_WORDS = ['ลิงก์', 'ลิ้งค์', 'ตะกร้า', 'โค้ดส่วนลด', 'ส่วนลด', 'กดสั่ง', 'สั่งซื้อ', 'โปรโมชั่น', 'link', 'code', 'shop', 'discount', 'promo'];
const RISK_WORDS = ['พนัน', 'บาคาร่า', 'สล็อต', 'คาสิโน', 'casino', 'gambling', 'slot', 'เหล้า', 'เมา', '18+', 'nsfw', 'onlyfans'];
const MINOR_PATTERNS = [/(^|\s)ม\.\s?[1-6](\s|$)/, /ชั้นมัธยม/, /นักเรียนมัธยม/, /\bgrade\s?(6|7|8|9|10|11)\b/i, /อายุ\s?1[0-7]\s?ปี/];
const TONE_RULES: { tag: string; words: string[] }[] = [
  { tag: 'ตลก', words: ['555', 'ตลก', 'ฮา', 'funny', 'joke'] },
  { tag: 'รีวิว', words: ['รีวิว', 'review', 'ใช้จริง', 'ป้ายยา'] },
  { tag: 'ให้ความรู้', words: ['วิธี', 'เคล็ดลับ', 'how to', 'tips', 'สอน'] },
  { tag: 'ไลฟ์สไตล์', words: ['vlog', 'ชีวิตประจำวัน', 'daily', 'วันนี้'] },
];

/** Keywords that describe the brand: matching vocabulary, category words and product names. */
export function brandKeywords(brand: BrandProfile): string[] {
  return uniqText([
    ...brand.matchingQueries.keywordsTh,
    ...brand.matchingQueries.keywordsEn,
    ...brand.matchingQueries.seedHashtags,
    ...categoryKeywords(brand.brand.industryId),
    ...brand.brand.subCategories,
    ...brand.brand.products.map((p) => p.name),
  ]).filter((k) => k.replace(/^#/, '').trim().length >= 2);
}

const clampScore = (n: number): 0 | 1 | 2 => (n >= 2 ? 2 : n >= 1 ? 1 : 0);

const RISK_ORDER: Record<SuitabilityTier, number> = { low: 0, medium: 1, high: 2 };

/**
 * Deterministic rubric from simple caption/hashtag heuristics against the brand keywords and computed metrics.
 * Notes say plainly that the scores are keyword-based, not a reading of the videos.
 */
export function buildStubEvaluation(brand: BrandProfile, d: CreatorDossier): KolEvaluation {
  const kws = brandKeywords(brand);
  const videos = d.videos.slice(0, 20);
  const n = videos.length;
  const texts = videos.map((v) => ({ id: v.platformVideoId, text: videoText(v), v }));
  const relevant = texts.filter((t) => kws.some((k) => hasKeyword(t.text, k)));
  const selling = texts.filter((t) => t.v.hasShopProduct === true || t.v.isSponsored === true || CTA_WORDS.some((w) => hasKeyword(t.text, w)));
  const risky = texts.filter((t) => RISK_WORDS.some((w) => hasKeyword(t.text, w)));
  const ids = (xs: typeof texts): string[] => xs.slice(0, 3).map((x) => x.id);
  const m = d.metrics;

  const relevance = clampScore(relevant.length >= 3 ? 2 : relevant.length >= 1 ? 1 : 0);
  const thai = d.audience?.thaiShare ?? null;
  const audienceFit = clampScore(thai != null ? (thai >= 0.8 && relevance >= 1 ? 2 : thai >= 0.5 ? 1 : 0) : relevance >= 1 ? 1 : 0);
  const persuasion = clampScore(selling.length >= 3 ? 2 : selling.length >= 1 ? 1 : 0);
  const share = m.sponsoredShare;
  const credibility = clampScore(share != null && share > 0.5 ? 0 : share != null && share <= 0.3 && (m.erViewsMedian ?? 0) >= 0.04 ? 2 : 1);
  const er = m.erViewsMedian;
  const execution = clampScore(er == null ? 1 : er >= 0.05 ? 2 : er >= 0.02 ? 1 : 0);

  const rubric: RubricScore[] = [
    {
      criterion: 'audience_fit',
      score: audienceFit,
      evidenceVideoIds: audienceFit > 0 ? ids(relevant.length ? relevant : texts) : [],
      noteTh:
        thai != null
          ? `ผู้ชมที่ประเมินได้เป็นคนไทยประมาณ ${fmtPct(thai, 0)} (ค่าประมาณจากคอมเมนต์หรือเนื้อหา) และพบคลิปที่ตรงกับคำสำคัญของแบรนด์ ${relevant.length} คลิป`
          : `ยังไม่มีข้อมูลประชากรผู้ชม จึงประเมินจากความเกี่ยวข้องของเนื้อหาเท่านั้น`,
    },
    {
      criterion: 'content_product_relevance',
      score: relevance,
      evidenceVideoIds: ids(relevant),
      noteTh: `พบคลิปที่มีคำสำคัญของแบรนด์หรือหมวดสินค้าในแคปชันหรือแฮชแท็ก ${relevant.length} จาก ${n} คลิปล่าสุด`,
    },
    {
      criterion: 'persuasion',
      score: persuasion,
      evidenceVideoIds: ids(selling),
      noteTh: `พบคลิปที่มีตะกร้าสินค้า งานสปอนเซอร์ หรือคำชวนซื้อ ${selling.length} จาก ${n} คลิป`,
    },
    {
      criterion: 'credibility',
      score: credibility,
      evidenceVideoIds: credibility > 0 ? ids(texts) : [],
      noteTh:
        share != null
          ? `สัดส่วนคลิปสปอนเซอร์ ${fmtPct(share, 0)} และอัตราการมีส่วนร่วมต่อยอดวิว ${fmtPct(er)}`
          : 'ไม่มีข้อมูลสัดส่วนคลิปสปอนเซอร์ จึงให้คะแนนกลาง',
    },
    {
      criterion: 'format_execution',
      score: execution,
      evidenceVideoIds: execution > 0 ? ids([...texts].sort((a, b) => (b.v.views ?? -1) - (a.v.views ?? -1))) : [],
      noteTh: er != null ? `ประเมินจากอัตราการมีส่วนร่วมต่อยอดวิว ${fmtPct(er)} เพราะยังไม่ได้ดูตัวคลิปจริง` : 'ยังไม่มีข้อมูลอัตราการมีส่วนร่วม จึงให้คะแนนกลาง',
    },
  ];

  const corpus = texts.map((t) => t.text).join('\n');
  const categoryTags = uniqText([...matchCategories(corpus, REF_SEED.categories).map((c) => c.id), ...d.categories]).slice(0, 4);
  const toneTags = TONE_RULES.filter((r) => r.words.some((w) => hasKeyword(corpus, w))).map((r) => r.tag);
  const bioAndCaptions = `${d.profile.bio ?? ''}\n${corpus}`;
  const possibleMinor = MINOR_PATTERNS.some((re) => re.test(bioAndCaptions));
  const total = rubric.reduce((s, r) => s + r.score, 0);

  // suitabilityTier is a brand-safety RISK tier (low = safe). Keyword hits raise it to medium only; a riskier tier
  // already on the dossier is kept.
  const keywordRisk: SuitabilityTier = risky.length > 0 ? 'medium' : 'low';
  const suitabilityTier = RISK_ORDER[d.suitabilityTier ?? 'low'] > RISK_ORDER[keywordRisk] ? (d.suitabilityTier ?? 'low') : keywordRisk;

  return KolEvaluation.parse({
    creatorId: d.creatorId,
    handle: d.profile.handle,
    rubric,
    suitabilityTier,
    categoryTags,
    toneTags,
    possibleMinor,
    rationaleTh: `ประเมินแบบอัตโนมัติจากคำในแคปชัน แฮชแท็ก และตัวเลขที่คำนวณได้ (โหมดเดโม ไม่ได้ใช้ AI อ่านเนื้อหา) ได้ ${total} จาก 10 คะแนน${
      risky.length ? ` และพบคำที่อาจไม่ปลอดภัยต่อแบรนด์ใน ${risky.length} คลิป` : ''
    }`,
  });
}

export const ALL_CRITERIA: readonly RubricCriterion[] = ['audience_fit', 'content_product_relevance', 'persuasion', 'credibility', 'format_execution'];
