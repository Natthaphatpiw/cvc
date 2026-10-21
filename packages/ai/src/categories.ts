import { REF_SEED, type AudiencePersona, type BrandProfile, type Category, type MinMax, type Tier } from '@cvc/schemas';
import { hasKeyword } from './text';

/**
 * Keywords per ref category id (Thai + English) used by stubs and heuristics. Ambiguous short Thai words
 * (e.g. 'ลูก', which also appears in 'ลูกค้า') are left out on purpose.
 */
export const CATEGORY_KEYWORDS: Record<string, readonly string[]> = {
  beauty: ['beauty', 'ความงาม', 'บิวตี้', 'เครื่องสำอาง', 'cosmetics'],
  'beauty.skincare': ['skincare', 'สกินแคร์', 'เซรั่ม', 'serum', 'กันแดด', 'sunscreen', 'บำรุงผิว', 'ผิวแพ้ง่าย', 'toner', 'โทนเนอร์', 'moisturizer', 'มอยส์เจอไรเซอร์', 'ครีมบำรุง', 'ลดสิว', 'acne'],
  'beauty.makeup': ['makeup', 'เมคอัพ', 'แต่งหน้า', 'ลิปสติก', 'lipstick', 'รองพื้น', 'foundation', 'cushion', 'คุชชั่น', 'อายแชโดว์', 'บลัชออน'],
  fashion: ['fashion', 'แฟชั่น', 'เสื้อผ้า', 'outfit', 'ootd', 'กระเป๋า', 'รองเท้า', 'sneakers', 'แต่งตัว'],
  food: ['food', 'อาหาร', 'ขนม', 'snack', 'เครื่องดื่ม', 'สูตรอาหาร', 'recipe', 'ทำอาหาร', 'cooking', 'อร่อย'],
  'food.restaurant': ['restaurant', 'ร้านอาหาร', 'คาเฟ่', 'cafe', 'ร้านกาแฟ', 'บุฟเฟ่ต์', 'buffet', 'รีวิวร้าน', 'ร้านเด็ด'],
  health: ['health', 'สุขภาพ', 'ดูแลสุขภาพ', 'wellness'],
  'health.fitness': ['fitness', 'ฟิตเนส', 'ออกกำลังกาย', 'workout', 'gym', 'ยิม', 'วิ่ง', 'running', 'โยคะ', 'yoga', 'ลดน้ำหนัก'],
  'health.supplement': ['supplement', 'อาหารเสริม', 'วิตามิน', 'vitamin', 'คอลลาเจน', 'collagen', 'เวย์โปรตีน', 'whey'],
  mom_baby: ['แม่และเด็ก', 'คุณแม่', 'แม่ลูกอ่อน', 'ทารก', 'baby', 'mom', 'ผ้าอ้อม', 'diaper', 'นมผง', 'ตั้งครรภ์'],
  gaming: ['gaming', 'เกมมือถือ', 'เล่นเกม', 'game', 'rov', 'pubg', 'free fire', 'valorant', 'esports', 'สตรีมเกม'],
  tech: ['tech', 'ไอที', 'แกดเจ็ต', 'gadget', 'มือถือ', 'smartphone', 'โน้ตบุ๊ก', 'laptop', 'หูฟัง', 'iphone', 'android'],
  travel: ['travel', 'ท่องเที่ยว', 'เที่ยว', 'ทริป', 'trip', 'โรงแรม', 'hotel', 'รีสอร์ท', 'resort', 'ที่พัก'],
  home: ['home', 'แต่งบ้าน', 'คอนโด', 'condo', 'เฟอร์นิเจอร์', 'furniture', 'ของใช้ในบ้าน', 'decor'],
  pets: ['pets', 'pet', 'สัตว์เลี้ยง', 'หมา', 'แมว', 'dog', 'cat', 'อาหารสัตว์', 'ทาสแมว'],
  finance: ['finance', 'การเงิน', 'ลงทุน', 'invest', 'หุ้น', 'stock', 'ประกัน', 'insurance', 'บัตรเครดิต', 'ออมเงิน', 'สินเชื่อ', 'กองทุน'],
  education: ['education', 'การศึกษา', 'ติวเตอร์', 'คอร์สเรียน', 'course', 'เรียนภาษา', 'สอบ'],
  lifestyle: ['lifestyle', 'ไลฟ์สไตล์', 'vlog', 'ชีวิตประจำวัน', 'daily'],
  business: ['business', 'ธุรกิจ', 'sme', 'ขายของออนไลน์', 'การตลาด', 'marketing', 'เจ้าของกิจการ', 'startup'],
  family: ['family', 'ครอบครัว', 'พ่อแม่ลูก'],
  alcohol: ['alcohol', 'เหล้า', 'เบียร์', 'beer', 'ไวน์', 'wine', 'ค็อกเทล', 'cocktail', 'วิสกี้', 'whisky'],
};

export function categoryKeywords(categoryId: string): readonly string[] {
  const own = CATEGORY_KEYWORDS[categoryId] ?? [];
  const parentId = categoryId.includes('.') ? categoryId.split('.')[0] : undefined;
  const parent = parentId ? (CATEGORY_KEYWORDS[parentId] ?? []) : [];
  return [...own, ...parent];
}

/** Category ids whose keywords occur in the (lowercased) text, best first. */
export function matchCategories(textLower: string, categories: readonly Category[]): { id: string; hits: number }[] {
  const scored: { id: string; hits: number }[] = [];
  for (const c of categories) {
    const kws = [...(CATEGORY_KEYWORDS[c.id] ?? []), c.labelTh, c.labelEn];
    const hits = kws.filter((k) => hasKeyword(textLower, k)).length;
    if (hits > 0) scored.push({ id: c.id, hits: hits + (c.parentId ? 0.5 : 0) });
  }
  return scored.sort((a, b) => b.hits - a.hits || a.id.localeCompare(b.id));
}

/**
 * Deterministic category guess from free text + selected personas. Persona category hints count as one hit each.
 * Falls back to 'lifestyle' (or the first category) so the result is always a valid id from `categories`.
 */
export function guessCategory(texts: readonly string[], categories: readonly Category[], personas: readonly AudiencePersona[]): Category {
  const list = categories.length > 0 ? categories : REF_SEED.categories;
  const textLower = texts.join('\n').normalize('NFC').toLowerCase();
  const score = new Map<string, number>();
  for (const m of matchCategories(textLower, list)) score.set(m.id, m.hits);
  for (const p of personas) {
    for (const hint of p.categoryHints) {
      if (list.some((c) => c.id === hint)) score.set(hint, (score.get(hint) ?? 0) + 1);
    }
  }
  const best = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const byId = (id: string): Category | undefined => list.find((c) => c.id === id);
  return (best && byId(best[0])) ?? byId('lifestyle') ?? (list[0] as Category);
}

export function regulatedFor(categoryId: string): BrandProfile['brand']['regulatedCategory'] {
  if (categoryId === 'health.supplement') return 'supplement';
  if (categoryId === 'beauty' || categoryId.startsWith('beauty.')) return 'cosmetics';
  if (categoryId === 'alcohol') return 'alcohol';
  if (categoryId === 'finance') return 'finance';
  return 'none';
}

/** Follower range covering the preferred tiers (REF_SEED bands); a micro–mid default when none are given. */
export function followerRangeForTiers(tiers: readonly Tier[]): MinMax {
  const bands = REF_SEED.tierBands.filter((b) => tiers.includes(b.tier));
  if (bands.length === 0) return { min: 10_000, max: 500_000 };
  const min = Math.min(...bands.map((b) => b.minFollowers));
  const max = Math.max(...bands.map((b) => b.maxFollowers ?? 10_000_000));
  return { min, max };
}

export function categoryLabel(categoryId: string, categories: readonly Category[] = REF_SEED.categories): { th: string; en: string } {
  const c = categories.find((x) => x.id === categoryId) ?? REF_SEED.categories.find((x) => x.id === categoryId);
  return c ? { th: c.labelTh, en: c.labelEn } : { th: categoryId, en: categoryId };
}
