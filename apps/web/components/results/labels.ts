import type {
  CollaborationModel,
  Confidence,
  ContentFormat,
  CreatorRole,
  EvidenceSourceType,
  ExpectedKpis,
  GroupWeights,
  NextAction,
  Objective,
  PortfolioPlan,
  RubricCriterion,
  Tier,
} from '@cvc/schemas';

export type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'negative';
export type ScoreGroupKey = keyof GroupWeights;

export const GROUP_ORDER: readonly ScoreGroupKey[] = ['fit', 'audience', 'performance', 'trust', 'cost'];

export const GROUP_LABEL: Record<ScoreGroupKey, string> = {
  fit: 'ความเข้ากับแบรนด์',
  audience: 'กลุ่มผู้ชม',
  performance: 'ผลงานคลิป',
  trust: 'ความน่าเชื่อถือ',
  cost: 'ความคุ้มค่า',
};

export const TIER_LABEL: Record<Tier, string> = {
  nano: 'Nano',
  micro: 'Micro',
  mid: 'Mid',
  macro: 'Macro',
  mega: 'Mega',
};

/** Same words as the form (objective-control.tsx) and the agent's OBJECTIVE_LABEL_TH, which the overview text uses. */
export const OBJECTIVE_LABEL: Record<Objective, string> = {
  awareness: 'รับรู้แบรนด์',
  launch: 'เปิดตัวสินค้า',
  conversion: 'เพิ่มยอดขาย',
  tiktok_shop: 'TikTok Shop',
  brand_building: 'สร้างแบรนด์ระยะยาว',
  ugc: 'คอนเทนต์ UGC',
};

export const OBJECTIVE_ORDER: readonly Objective[] = ['awareness', 'launch', 'conversion', 'tiktok_shop', 'brand_building', 'ugc'];

export const RUBRIC_LABEL: Record<RubricCriterion, string> = {
  audience_fit: 'ผู้ชมตรงกลุ่มเป้าหมาย',
  content_product_relevance: 'คอนเทนต์ตรงหมวดสินค้า',
  persuasion: 'ทักษะการแนะนำและชวนซื้อ',
  credibility: 'ความน่าเชื่อถือ',
  format_execution: 'คุณภาพการผลิตคลิป',
};

export const ROLE_LABEL: Record<CreatorRole, string> = {
  hero_awareness: 'สร้างการรับรู้หลัก',
  conversion_driver: 'ผลักดันยอดขาย',
  community_trust: 'สร้างความเชื่อมั่นในกลุ่มผู้ชม',
  ugc_content: 'ผลิตคอนเทนต์ให้แบรนด์นำไปใช้',
  live_seller: 'ไลฟ์ขายสินค้า',
};

export const FORMAT_LABEL: Record<ContentFormat, string> = {
  in_feed: 'คลิปในฟีด',
  live: 'ไลฟ์',
  affiliate: 'แอฟฟิลิเอต',
  series: 'คลิปซีรีส์',
  duet_stitch: 'Duet / Stitch',
  spark_ads: 'Spark Ads',
};

export const COLLABORATION_LABEL: Record<CollaborationModel, string> = {
  fixed_fee: 'ค่าตัวคงที่',
  affiliate_commission: 'ค่าคอมมิชชันจากยอดขาย',
  hybrid: 'ค่าตัวคงที่ร่วมกับคอมมิชชัน',
  gifting: 'ส่งสินค้าให้ทดลองใช้',
};

export const OWNER_LABEL: Record<NextAction['owner'], string> = {
  planner: 'นักวางแผน',
  client: 'ลูกค้า',
  creator: 'ครีเอเตอร์',
};

export const OWNER_ORDER: readonly NextAction['owner'][] = ['planner', 'client', 'creator'];

export const ACTION_CATEGORY_LABEL: Record<NextAction['category'], string> = {
  outreach: 'ติดต่อ',
  brief: 'บรีฟ',
  contract: 'สัญญา',
  tracking: 'การวัดผล',
  launch: 'เผยแพร่',
  report: 'รายงาน',
};

export const SOURCE_TYPE_LABEL: Record<EvidenceSourceType, string> = {
  website: 'เว็บไซต์',
  facebook: 'Facebook',
  facebook_ads: 'Facebook Ads',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  web_search: 'ค้นเว็บ',
  pantip: 'Pantip',
  kb: 'คลังความรู้',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: 'สูง', medium: 'ปานกลาง', low: 'ต่ำ' };
export const CONFIDENCE_TONE: Record<Confidence, BadgeTone> = { high: 'positive', medium: 'neutral', low: 'warning' };
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

export const BUDGET_FIT_LABEL: Record<PortfolioPlan['budgetFit'], string> = {
  within: 'อยู่ในงบ',
  over: 'เกินงบ',
  under: 'ต่ำกว่างบ',
  no_budget: 'ไม่ได้ระบุงบ',
};
export const BUDGET_FIT_TONE: Record<PortfolioPlan['budgetFit'], BadgeTone> = {
  within: 'positive',
  over: 'negative',
  under: 'accent',
  no_budget: 'neutral',
};

export const KPI_METHOD_LABEL: Record<ExpectedKpis['basis']['method'], string> = {
  creator_history: 'คำนวณจากประวัติคลิปของครีเอเตอร์',
  tier_benchmark: 'ใช้ค่าอ้างอิงของระดับผู้ติดตาม เพราะคลิปของครีเอเตอร์มีไม่พอ',
  mixed: 'ผสมประวัติคลิปของครีเอเตอร์กับค่าอ้างอิงของระดับผู้ติดตาม',
};

export const SPONSORED_SOURCE_LABEL: Record<ExpectedKpis['basis']['sponsoredFactorSource'], string> = {
  creator_history: 'จากคลิปที่มีสปอนเซอร์ของครีเอเตอร์เอง',
  benchmark: 'จากค่าอ้างอิงของเอเจนซี',
};

export const STORYLINE_FORMAT_LABEL: Record<'in_feed' | 'live' | 'affiliate' | 'series', string> = {
  in_feed: FORMAT_LABEL.in_feed,
  live: FORMAT_LABEL.live,
  affiliate: FORMAT_LABEL.affiliate,
  series: FORMAT_LABEL.series,
};

export const ASSUMPTION_SOURCE = 'assumption_to_calibrate';
export const ASSUMPTION_NOTE_TH =
  'ค่าอ้างอิงบางตัวเป็นสมมติฐานที่ยังต้องปรับเทียบกับผลแคมเปญจริงของ Convert Cake ใช้เป็นแนวทางเท่านั้น';

/** True when any benchmark behind the estimate is a placeholder that still needs calibration. */
export function usesAssumption(kpis: ExpectedKpis): boolean {
  if (kpis.basis.benchmarkSources.some((s) => s.includes(ASSUMPTION_SOURCE))) return true;
  return kpis.conversion?.assumptions.source.includes(ASSUMPTION_SOURCE) ?? false;
}

/** Lowest confidence among the estimates (a portfolio total is only as sure as its weakest part). */
export function lowestConfidence(list: readonly Confidence[]): Confidence | null {
  let lowest: Confidence | null = null;
  for (const c of list) {
    if (lowest === null || CONFIDENCE_RANK[c] < CONFIDENCE_RANK[lowest]) lowest = c;
  }
  return lowest;
}

export function benchmarkSourceLabel(source: string): string {
  if (source.includes(ASSUMPTION_SOURCE)) return 'สมมติฐานที่ต้องปรับเทียบ';
  if (source === 'cvc_internal') return 'ข้อมูลภายในของ Convert Cake';
  return source;
}

export function dueLabel(days: number): string {
  return days <= 0 ? 'ทำได้ทันที' : `ภายใน ${days} วัน`;
}

/**
 * One short line for a collapsed Disclosure preview (it is also read as the trigger's description, so a whole
 * paragraph would be too long). Thai separates phrases with spaces, so cut at the last space before `max`.
 */
export function previewTh(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.lastIndexOf(' ', max);
  return `${flat.slice(0, cut > max / 2 ? cut : max).trimEnd()}…`;
}
