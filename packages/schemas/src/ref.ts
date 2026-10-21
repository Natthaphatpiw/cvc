import { z } from 'zod';
import { Objective, Tier } from './common';
import type { AudiencePersona } from './input';

/** Rows of the ref.* tables in camelCase. The api owns writes; agent and scoring read them. */
export const TierBand = z.object({ tier: Tier, minFollowers: z.number(), maxFollowers: z.number().nullable() });
export type TierBand = z.infer<typeof TierBand>;

export const Category = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  labelTh: z.string(),
  labelEn: z.string(),
  tiktokBcPolicy: z.enum(['allowed', 'restricted', 'prohibited']),
  nicheMultiplier: z.number(),
});
export type Category = z.infer<typeof Category>;

export const RateCard = z.object({
  tier: Tier,
  categoryId: z.string().nullable(),
  format: z.enum(['in_feed', 'live', 'affiliate', 'series']),
  feeMinTHB: z.number(),
  feeMaxTHB: z.number(),
  /** 'cvc_internal' wins over every other source */
  source: z.string(),
});
export type RateCard = z.infer<typeof RateCard>;

export const TierBenchmark = z.object({
  tier: Tier,
  categoryId: z.string().nullable(),
  metric: z.enum(['er_views', 'median_views', 'views_per_follower', 'posts_per_week', 'cpv_thb']),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  source: z.string(),
});
export type TierBenchmark = z.infer<typeof TierBenchmark>;

export const KpiBenchmark = z.object({
  /** null = applies to every objective / category / tier */
  objective: Objective.nullable(),
  categoryId: z.string().nullable(),
  tier: Tier.nullable(),
  metric: z.enum(['sponsored_view_factor', 'ctr', 'cvr', 'er_views']),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  source: z.string(),
  noteTh: z.string().nullable(),
});
export type KpiBenchmark = z.infer<typeof KpiBenchmark>;

export const RefData = z.object({
  tierBands: z.array(TierBand),
  categories: z.array(Category),
  rateCards: z.array(RateCard),
  tierBenchmarks: z.array(TierBenchmark),
  kpiBenchmarks: z.array(KpiBenchmark),
});
export type RefData = z.infer<typeof RefData>;

// ---------------------------------------------------------------------------------------------
// Static copy of supabase/migrations/20261021001100_reference_data.sql. Used when no database is
// configured (demo mode) and by unit tests. Keep the two in sync.
// ---------------------------------------------------------------------------------------------

const cat = (id: string, parentId: string | null, labelTh: string, labelEn: string, nicheMultiplier: number, tiktokBcPolicy: Category['tiktokBcPolicy'] = 'allowed'): Category => ({
  id, parentId, labelTh, labelEn, tiktokBcPolicy, nicheMultiplier,
});

export const REF_SEED: RefData = {
  tierBands: [
    { tier: 'nano', minFollowers: 1_000, maxFollowers: 9_999 },
    { tier: 'micro', minFollowers: 10_000, maxFollowers: 99_999 },
    { tier: 'mid', minFollowers: 100_000, maxFollowers: 499_999 },
    { tier: 'macro', minFollowers: 500_000, maxFollowers: 999_999 },
    { tier: 'mega', minFollowers: 1_000_000, maxFollowers: null },
  ],
  categories: [
    cat('beauty', null, 'ความงาม', 'Beauty', 1.1),
    cat('beauty.skincare', 'beauty', 'สกินแคร์', 'Skincare', 1.15),
    cat('beauty.makeup', 'beauty', 'เมคอัพ', 'Makeup', 1.1),
    cat('fashion', null, 'แฟชั่น', 'Fashion', 1.05),
    cat('food', null, 'อาหาร', 'Food', 1.0),
    cat('food.restaurant', 'food', 'ร้านอาหาร/คาเฟ่', 'Restaurants', 1.0),
    cat('health', null, 'สุขภาพ', 'Health', 1.1),
    cat('health.fitness', 'health', 'ฟิตเนส', 'Fitness', 1.05),
    cat('health.supplement', 'health', 'อาหารเสริม', 'Supplements', 1.2, 'restricted'),
    cat('mom_baby', null, 'แม่และเด็ก', 'Mom & baby', 1.1),
    cat('gaming', null, 'เกม', 'Gaming', 1.0),
    cat('tech', null, 'ไอที/แกดเจ็ต', 'Tech', 1.1),
    cat('travel', null, 'ท่องเที่ยว', 'Travel', 1.05),
    cat('home', null, 'บ้านและของแต่งบ้าน', 'Home', 1.0),
    cat('pets', null, 'สัตว์เลี้ยง', 'Pets', 1.0),
    cat('finance', null, 'การเงิน', 'Finance', 1.25, 'restricted'),
    cat('education', null, 'การศึกษา', 'Education', 1.0),
    cat('lifestyle', null, 'ไลฟ์สไตล์', 'Lifestyle', 1.0),
    cat('business', null, 'ธุรกิจ/SME', 'Business', 1.05),
    cat('family', null, 'ครอบครัว', 'Family', 1.0),
    cat('alcohol', null, 'เครื่องดื่มแอลกอฮอล์', 'Alcohol', 1.2, 'restricted'),
  ],
  rateCards: [
    { tier: 'nano', categoryId: null, format: 'in_feed', feeMinTHB: 1_500, feeMaxTHB: 5_000, source: 'clisk_2026' },
    { tier: 'micro', categoryId: null, format: 'in_feed', feeMinTHB: 5_000, feeMaxTHB: 30_000, source: 'clisk_2026' },
    { tier: 'mid', categoryId: null, format: 'in_feed', feeMinTHB: 30_000, feeMaxTHB: 100_000, source: 'clisk_2026' },
    { tier: 'macro', categoryId: null, format: 'in_feed', feeMinTHB: 100_000, feeMaxTHB: 300_000, source: 'clisk_2026' },
    { tier: 'mega', categoryId: null, format: 'in_feed', feeMinTHB: 300_000, feeMaxTHB: 800_000, source: 'clisk_2026' },
  ],
  tierBenchmarks: [
    { tier: 'nano', categoryId: null, metric: 'er_views', p25: 0.025, p50: 0.044, p75: 0.07, source: 'socialinsider_2025' },
    { tier: 'micro', categoryId: null, metric: 'er_views', p25: 0.022, p50: 0.039, p75: 0.065, source: 'socialinsider_2025' },
    { tier: 'mid', categoryId: null, metric: 'er_views', p25: 0.02, p50: 0.0375, p75: 0.06, source: 'socialinsider_2025' },
    { tier: 'macro', categoryId: null, metric: 'er_views', p25: 0.02, p50: 0.0395, p75: 0.06, source: 'socialinsider_2025' },
    { tier: 'mega', categoryId: null, metric: 'er_views', p25: 0.018, p50: 0.035, p75: 0.055, source: 'socialinsider_2025' },
    { tier: 'nano', categoryId: null, metric: 'median_views', p25: 800, p50: 2_500, p75: 6_000, source: 'assumption_to_calibrate' },
    { tier: 'micro', categoryId: null, metric: 'median_views', p25: 5_000, p50: 15_000, p75: 40_000, source: 'assumption_to_calibrate' },
    { tier: 'mid', categoryId: null, metric: 'median_views', p25: 25_000, p50: 60_000, p75: 150_000, source: 'assumption_to_calibrate' },
    { tier: 'macro', categoryId: null, metric: 'median_views', p25: 80_000, p50: 200_000, p75: 450_000, source: 'assumption_to_calibrate' },
    { tier: 'mega', categoryId: null, metric: 'median_views', p25: 250_000, p50: 600_000, p75: 1_500_000, source: 'assumption_to_calibrate' },
  ],
  kpiBenchmarks: [
    { objective: null, categoryId: null, tier: null, metric: 'sponsored_view_factor', p25: 0.6, p50: 0.8, p75: 1.0, source: 'assumption_to_calibrate', noteTh: 'สัดส่วนยอดวิวคลิปที่มีสปอนเซอร์ต่อคลิปทั่วไป ใช้เมื่อครีเอเตอร์มีคลิปสปอนเซอร์ไม่ถึง 3 คลิป' },
    { objective: 'conversion', categoryId: null, tier: null, metric: 'ctr', p25: 0.003, p50: 0.006, p75: 0.01, source: 'assumption_to_calibrate', noteTh: 'อัตราคลิกลิงก์ต่อยอดวิว ต้องปรับเทียบกับผลแคมเปญของ CVC' },
    { objective: 'conversion', categoryId: null, tier: null, metric: 'cvr', p25: 0.01, p50: 0.02, p75: 0.04, source: 'assumption_to_calibrate', noteTh: 'อัตราการซื้อต่อคลิก ต้องปรับเทียบกับผลแคมเปญของ CVC' },
    { objective: 'tiktok_shop', categoryId: null, tier: null, metric: 'ctr', p25: 0.005, p50: 0.01, p75: 0.018, source: 'assumption_to_calibrate', noteTh: 'อัตรากดตะกร้าต่อยอดวิว (TikTok Shop) ต้องปรับเทียบ' },
    { objective: 'tiktok_shop', categoryId: null, tier: null, metric: 'cvr', p25: 0.02, p50: 0.035, p75: 0.06, source: 'assumption_to_calibrate', noteTh: 'อัตราการซื้อต่อการกดตะกร้า ต้องปรับเทียบ' },
  ],
};

const persona = (
  id: string, labelTh: string, labelEn: string, descriptionTh: string,
  ageDist: Record<string, number>, genderDist: Record<string, number>, regionDist: Record<string, number> | null,
  interests: string[], categoryHints: string[],
): AudiencePersona => ({ id, labelTh, labelEn, descriptionTh, ageDist, genderDist, regionDist, interests, categoryHints });

/** Static copy of the ref.audience_personas seed, in sort order. */
export const PERSONAS_SEED: AudiencePersona[] = [
  persona('th_genz_beauty_bkk', 'สาว Gen Z สายบิวตี้ กทม.', 'Gen Z beauty lovers (BKK)', 'อายุ 18–24 ในกรุงเทพฯ ตามเทรนด์สกินแคร์และเมคอัพ', { '18-24': 0.75, '25-34': 0.25 }, { female: 0.85, male: 0.15 }, { BKK: 0.7, Central: 0.2, Other: 0.1 }, ['skincare', 'makeup', 'trends'], ['beauty']),
  persona('first_jobber', 'First jobber วัยเริ่มทำงาน', 'First jobbers', 'เพิ่งเริ่มทำงาน รายได้เริ่มต้น สนใจของคุ้มค่า', { '18-24': 0.4, '25-34': 0.6 }, { female: 0.55, male: 0.45 }, { BKK: 0.5, Central: 0.25, Other: 0.25 }, ['career', 'value', 'lifestyle'], ['lifestyle', 'finance']),
  persona('new_mom', 'คุณแม่มือใหม่', 'New moms', 'แม่ลูกเล็ก หาข้อมูลก่อนซื้อ เชื่อรีวิวจากแม่ด้วยกัน', { '25-34': 0.65, '35-44': 0.35 }, { female: 0.95, male: 0.05 }, null, ['parenting', 'baby', 'health'], ['mom_baby']),
  persona('foodie', 'สายกิน/รีวิวร้าน', 'Foodies', 'ตามรีวิวร้านอาหารและคาเฟ่', { '18-24': 0.35, '25-34': 0.45, '35-44': 0.2 }, { female: 0.55, male: 0.45 }, null, ['food', 'cafe', 'travel'], ['food']),
  persona('fitness_health', 'สายสุขภาพ/ฟิตเนส', 'Health & fitness', 'ออกกำลังกาย ดูแลรูปร่าง อ่านฉลาก', { '18-24': 0.3, '25-34': 0.45, '35-44': 0.25 }, { female: 0.5, male: 0.5 }, null, ['fitness', 'nutrition'], ['health']),
  persona('gamer', 'เกมเมอร์', 'Gamers', 'เล่นเกมมือถือ/คอนโซล ดูสตรีม', { '18-24': 0.6, '25-34': 0.4 }, { female: 0.25, male: 0.75 }, null, ['gaming', 'tech'], ['gaming']),
  persona('sme_owner', 'เจ้าของธุรกิจ SME', 'SME owners', 'เจ้าของกิจการเล็ก-กลาง สนใจเครื่องมือทำธุรกิจ', { '25-34': 0.45, '35-44': 0.4, '45-54': 0.15 }, { female: 0.45, male: 0.55 }, null, ['business', 'marketing'], ['business']),
  persona('uni_upcountry', 'นักศึกษาต่างจังหวัด', 'Upcountry students', 'นักศึกษามหาวิทยาลัยต่างจังหวัด งบจำกัด', { '18-24': 1.0 }, { female: 0.55, male: 0.45 }, { North: 0.3, Northeast: 0.35, South: 0.2, Central: 0.15 }, ['education', 'value', 'entertainment'], ['education', 'lifestyle']),
  persona('traveler', 'สายเที่ยว', 'Travelers', 'เที่ยวในประเทศ วางแผนจากคลิปรีวิว', { '18-24': 0.3, '25-34': 0.45, '35-44': 0.25 }, { female: 0.55, male: 0.45 }, null, ['travel', 'food'], ['travel']),
  persona('tech_early', 'สายไอที/แกดเจ็ต', 'Tech early adopters', 'ซื้อแกดเจ็ตก่อนคนอื่น อ่านสเปก', { '18-24': 0.4, '25-34': 0.45, '35-44': 0.15 }, { female: 0.25, male: 0.75 }, null, ['tech', 'gaming'], ['tech']),
  persona('pet_lover', 'ทาสหมาแมว', 'Pet lovers', 'เลี้ยงสัตว์ ซื้ออาหารและของใช้สัตว์', { '18-24': 0.3, '25-34': 0.5, '35-44': 0.2 }, { female: 0.65, male: 0.35 }, null, ['pets'], ['pets']),
  persona('home_decor', 'สายแต่งบ้าน/คอนโด', 'Home & condo', 'แต่งห้อง คอนโด ของใช้ในบ้าน', { '25-34': 0.55, '35-44': 0.45 }, { female: 0.65, male: 0.35 }, null, ['home', 'lifestyle'], ['home']),
  persona('isan_mass', 'กลุ่มแมส ภาคอีสาน', 'Northeast mass market', 'ผู้ชมภาคอีสาน ชอบคอนเทนต์ภาษาถิ่น', { '18-24': 0.35, '25-34': 0.4, '35-44': 0.25 }, { female: 0.55, male: 0.45 }, { Northeast: 1.0 }, ['entertainment', 'value'], ['lifestyle']),
  persona('silver_age', 'วัยเกษียณ/50+', 'Silver age', 'อายุ 50 ขึ้นไป ดูแลสุขภาพและครอบครัว', { '45-54': 0.4, '55+': 0.6 }, { female: 0.55, male: 0.45 }, null, ['health', 'family'], ['health', 'family']),
];
