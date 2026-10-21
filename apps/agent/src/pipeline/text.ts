import type { BrandCard, BrandProfile, CreatorRole, GroupWeights, Objective, RefData, ScoreGroup } from '@cvc/schemas';

// Thai template text used when an LLM narrative is unavailable, and for fields no LLM writes.

export const OBJECTIVE_TH: Record<Objective, string> = {
  awareness: 'การรับรู้แบรนด์',
  launch: 'การเปิดตัวสินค้า',
  conversion: 'ยอดขาย',
  tiktok_shop: 'ยอดขายผ่าน TikTok Shop',
  brand_building: 'การสร้างภาพลักษณ์แบรนด์',
  ugc: 'คอนเทนต์ UGC',
};

export const PRICE_TH: Record<BrandProfile['brand']['pricePositioning'], string> = {
  mass: 'ราคาเข้าถึงง่าย (mass)',
  masstige: 'ระดับกลางค่อนบน (masstige)',
  premium: 'ระดับพรีเมียม (premium)',
  luxury: 'ระดับหรู (luxury)',
};

export const GROUP_TH: Record<ScoreGroup, string> = {
  fit: 'ความเข้ากับแบรนด์',
  audience: 'กลุ่มผู้ชม',
  performance: 'ผลงานคอนเทนต์',
  trust: 'ความน่าเชื่อถือ',
  cost: 'ความคุ้มค่า',
};

export const ROLE_TH: Record<CreatorRole, string> = {
  hero_awareness: 'สร้างการรับรู้ในวงกว้าง',
  conversion_driver: 'กระตุ้นยอดขาย',
  community_trust: 'สร้างความเชื่อมั่นในกลุ่มผู้ติดตาม',
  ugc_content: 'ผลิตคอนเทนต์ให้แบรนด์นำไปใช้ต่อ',
  live_seller: 'ขายผ่านไลฟ์',
};

export function categoryLabelTh(ref: RefData, id: string | null | undefined): string | null {
  if (!id) return null;
  return ref.categories.find((c) => c.id === id)?.labelTh ?? null;
}

export function brandIndustryTh(brand: BrandProfile, ref: RefData): string {
  return categoryLabelTh(ref, brand.brand.industryId) ?? brand.brand.industryId;
}

export function brandOneLinerTh(brand: BrandProfile, ref: RefData): string {
  const usp = brand.brand.products.map((p) => p.usp).find((u): u is string => typeof u === 'string' && u.trim().length > 0);
  const base = `แบรนด์${brandIndustryTh(brand, ref)} ${PRICE_TH[brand.brand.pricePositioning]}`;
  return usp ? `${base} จุดเด่น: ${usp}` : base;
}

export function brandCard(brand: BrandProfile, ref: RefData): BrandCard {
  return {
    name: brand.brand.name,
    industry: brandIndustryTh(brand, ref),
    oneLinerTh: brandOneLinerTh(brand, ref),
    toneKeywords: brand.brand.personality.toneKeywords.slice(0, 6),
  };
}

function topKeys(dist: Record<string, number>, n: number): string[] {
  return Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function audienceSummaryTh(brand: BrandProfile): string {
  const seg = brand.audience.segments[0];
  if (!seg) return 'ยังไม่มีข้อมูลกลุ่มเป้าหมายที่ชัดเจน';
  const ages = topKeys(seg.ageDist, 2).join(', ');
  const female = seg.genderDist.female ?? seg.genderDist.f ?? null;
  const gender =
    female === null ? '' : female >= 0.6 ? ' ส่วนใหญ่เป็นผู้หญิง' : female <= 0.4 ? ' ส่วนใหญ่เป็นผู้ชาย' : ' ทั้งผู้หญิงและผู้ชาย';
  const interests = seg.interests.slice(0, 3).join(', ');
  return `${seg.label}${ages ? ` อายุ ${ages} ปี` : ''}${gender}${interests ? ` สนใจ ${interests}` : ''}`;
}

export function strongestGroup(groups: GroupWeights): ScoreGroup {
  const entries: [ScoreGroup, number][] = [
    ['fit', groups.fit],
    ['audience', groups.audience],
    ['performance', groups.performance],
    ['trust', groups.trust],
    ['cost', groups.cost],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? 'fit';
}
