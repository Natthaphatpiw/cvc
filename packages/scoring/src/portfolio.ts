import type { CreatorRole, ExpectedKpis, KpiRange, MinMax, Objective, PortfolioPlan } from '@cvc/schemas';
import { ROLE_LABEL_TH } from './playbook';
import { feeMid } from './ref';
import { fmtInt, fmtTHBRange, round } from './stats';

const fmtTHB = (n: number): string => `฿${fmtInt(n)}`;

export type PortfolioItem = { creatorId: string; handle: string; fee: MinMax; kpis: ExpectedKpis; role: CreatorRole };

const UNDER_BUDGET_RATIO = 0.6;

function sumRange(xs: readonly KpiRange[]): KpiRange {
  return xs.reduce((a, r) => ({ p25: a.p25 + r.p25, p50: a.p50 + r.p50, p75: a.p75 + r.p75 }), { p25: 0, p50: 0, p75: 0 });
}

const ROLE_ORDER: readonly CreatorRole[] = ['hero_awareness', 'conversion_driver', 'live_seller', 'community_trust', 'ugc_content'];

function mixText(items: readonly PortfolioItem[], views: KpiRange): string {
  if (items.length === 0) return 'ยังไม่มีครีเอเตอร์ที่ผ่านเกณฑ์สำหรับแผนนี้';
  const parts = ROLE_ORDER.map((role) => ({ role, n: items.filter((i) => i.role === role).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${ROLE_LABEL_TH[x.role]} ${x.n} คน`);
  return (
    `ผสมครีเอเตอร์ ${items.length} คน ได้แก่ ${parts.join(', ')} ` +
    `คาดยอดวิวรวมราว ${fmtInt(views.p50)} วิว (ช่วง ${fmtInt(views.p25)}–${fmtInt(views.p75)}) เมื่อโพสต์คนละ 1 คลิป ` +
    'หมายเหตุ: ยอดรวมได้จากการบวกค่าเปอร์เซ็นไทล์ของแต่ละคนเข้าด้วยกัน ซึ่งเป็นการประมาณอย่างง่าย ช่วงจริงของทั้งชุดมักแคบกว่านี้'
  );
}

function timeline(objective: Objective, items: readonly PortfolioItem[]): PortfolioPlan['timeline'] {
  const hasLive = items.some((i) => i.role === 'live_seller');
  const week1 = ['ติดต่อครีเอเตอร์ในรายชื่อเพื่อเช็กคิวว่างและเรตจริง', 'ตรวจประวัติการรับงานแบรนด์คู่แข่งย้อนหลัง', 'ยืนยันตัวจริงและตัวสำรองกับลูกค้า'];
  if (objective === 'conversion') week1.push('ขอลิงก์หน้าสินค้าและโค้ดส่วนลดจากลูกค้า');
  if (objective === 'tiktok_shop') week1.push('ตรวจว่าสินค้าอยู่ในร้าน TikTok Shop และพร้อมเปิด affiliate');

  const week2 = ['ส่ง brief ที่ระบุข้อความหลัก จุดเด่นสินค้า ข้อห้าม และการติด #โฆษณา', 'ทำสัญญา: ค่าจ้าง กำหนดส่งงาน สิทธิ์การใช้คอนเทนต์ และระยะห้ามรับงานคู่แข่ง'];
  if (objective === 'conversion' || objective === 'tiktok_shop') week2.push('ตกลงอัตราค่าคอมมิชชันและรอบการจ่าย');
  if (objective === 'tiktok_shop') week2.push('เปิดสินค้าในโปรแกรม affiliate ของ TikTok Shop และส่งคำเชิญให้ครีเอเตอร์');
  if (objective === 'ugc') week2.push('ส่งสินค้าให้ครีเอเตอร์ทดลองใช้ก่อนถ่ายทำ');

  const week3 = ['ครีเอเตอร์ส่ง draft ให้ตรวจ (แก้ไขได้ไม่เกิน 2 รอบ)', 'ตรวจคำกล่าวอ้างของสินค้าให้ตรงข้อเท็จจริงและข้อกฎหมาย', 'เตรียมลิงก์ติดตามผลและขอรหัส Spark Ads'];
  if (hasLive) week3.push('นัดวันและเวลาไลฟ์ขาย พร้อมเตรียมโปรโมชันเฉพาะไลฟ์');

  const week4 = ['โพสต์ตามช่วงวันเวลาที่แนะนำของแต่ละคน', 'บูสต์คลิปที่ผลดีด้วย Spark Ads', 'เก็บผล 7 วันหลังโพสต์และสรุปรายงานให้ลูกค้า'];
  if (hasLive) week4.splice(1, 0, 'ไลฟ์ขายตามตารางและติดตามยอดขายระหว่างไลฟ์');

  return [
    { week: 1, titleTh: 'ติดต่อและยืนยัน', tasksTh: week1 },
    { week: 2, titleTh: 'brief และสัญญา', tasksTh: week2 },
    { week: 3, titleTh: 'ผลิตและอนุมัติคอนเทนต์', tasksTh: week3 },
    { week: 4, titleTh: 'เผยแพร่และวัดผล', tasksTh: week4 },
  ];
}

function measurementPlan(objective: Objective): string[] {
  const out: string[] = [];
  if (objective === 'conversion') {
    out.push('สร้างลิงก์ UTM แยกรายครีเอเตอร์ (utm_source=tiktok, utm_medium=influencer, utm_content=ชื่อบัญชี) หรือโค้ดส่วนลดเฉพาะคน เพื่อแยกยอดคลิกและยอดขายตามคน');
  }
  if (objective === 'tiktok_shop') {
    out.push('ใช้ลิงก์และโค้ด affiliate ของ TikTok Shop แยกรายครีเอเตอร์ เพื่อดูยอดกดตะกร้าและยอดขายรายคน');
  }
  out.push('ขอรหัสอนุญาต Spark Ads จากครีเอเตอร์ทุกคน เพื่อบูสต์คลิปที่ผลดีและเก็บสถิติในบัญชีโฆษณาของแบรนด์');
  out.push('เก็บยอดวิว ไลก์ คอมเมนต์ แชร์ และการบันทึกของทุกโพสต์เมื่อครบ 7 วัน (ขอ screenshot insight จากครีเอเตอร์)');
  out.push('เทียบผลจริงกับช่วงที่คาดการณ์ (p25–p75) ของแต่ละคน ทั้งยอดวิวและต้นทุนต่อวิว');
  if (objective === 'ugc') out.push('นับจำนวนคอนเทนต์ที่อนุมัติและนำไปใช้เป็นโฆษณา พร้อมต้นทุนต่อชิ้น');
  out.push('บันทึกผลจริงของแคมเปญลงระบบ (analysis.campaign_outcomes) เพื่อปรับเทียบค่ามาตรฐานอัตราคลิก อัตราการซื้อ และสัดส่วนยอดวิวคลิปสปอนเซอร์ในรอบถัดไป');
  return out;
}

/** Portfolio totals (summed per percentile), budget fit and Thai template text. */
export function buildPortfolioPlan(args: { objective: Objective; budgetTHB: MinMax | null; items: PortfolioItem[] }): PortfolioPlan {
  const { objective, budgetTHB: budget, items } = args;
  const feeTotal: MinMax = { min: items.reduce((a, i) => a + i.fee.min, 0), max: items.reduce((a, i) => a + i.fee.max, 0) };
  const views = sumRange(items.map((i) => i.kpis.perPost.views));
  const engagements = sumRange(items.map((i) => i.kpis.perPost.engagements));
  const conv = items.map((i) => i.kpis.conversion).filter((c): c is NonNullable<ExpectedKpis['conversion']> => c !== null);
  const clicks = conv.length > 0 ? sumRange(conv.map((c) => c.clicks)) : null;
  const orders = conv.length > 0 ? sumRange(conv.map((c) => c.orders)) : null;

  const lo = budget ? Math.min(budget.min, budget.max) : 0;
  const hi = budget ? Math.max(budget.min, budget.max) : 0;

  let budgetFit: PortfolioPlan['budgetFit'];
  let budgetFitTh: string;
  // Rate cards are wide, so judge the fit on the midpoint of the total fee and say when the upper end exceeds the budget.
  const feeMidTotal = items.reduce((a, i) => a + feeMid(i.fee), 0);
  const feeText = `${fmtTHBRange(feeTotal)} (ค่ากลาง ${fmtTHB(feeMidTotal)})`;
  const budgetText = budget ? fmtTHBRange({ min: lo, max: hi }) : '';
  if (!budget) {
    budgetFit = 'no_budget';
    budgetFitTh = `ยังไม่ได้ระบุงบประมาณ ค่าจ้างรวมโดยประมาณ ${feeText}`;
  } else if (feeMidTotal > hi) {
    budgetFit = 'over';
    budgetFitTh = `ค่าจ้างรวมโดยประมาณ ${feeText} สูงกว่างบ ${budgetText} ควรต่อรองราคา ใช้ค่าคอมมิชชันแทนค่าจ้างคงที่บางส่วน ลดจำนวนครีเอเตอร์ หรือเลือกระดับที่เล็กลง`;
  } else if (feeTotal.max < UNDER_BUDGET_RATIO * lo) {
    budgetFit = 'under';
    budgetFitTh = `ค่าจ้างรวมโดยประมาณ ${feeText} ต่ำกว่างบ ${budgetText} ค่อนข้างมาก ใช้งบที่เหลือเพิ่มครีเอเตอร์หรือบูสต์ด้วย Spark Ads ได้`;
  } else if (feeTotal.max > hi) {
    budgetFit = 'within';
    budgetFitTh = `ค่าจ้างรวมโดยประมาณ ${feeText} ค่ากลางอยู่ในงบ ${budgetText} แต่ช่วงบนเกินงบ ต้องยืนยันเรทจริงกับครีเอเตอร์ก่อนตกลง`;
  } else {
    budgetFit = 'within';
    budgetFitTh = `ค่าจ้างรวมโดยประมาณ ${feeText} อยู่ในกรอบงบ ${budgetText}`;
  }

  return {
    selectedCreatorIds: items.map((i) => i.creatorId),
    budgetAllocation: items.map((i) => ({
      creatorId: i.creatorId,
      handle: i.handle,
      feeTHB: { min: i.fee.min, max: i.fee.max },
      // Against the budget's upper end, like budgetFit, so a 'within' plan never sums past 100%.
      shareOfBudget: budget && hi > 0 ? round(feeMid(i.fee) / hi, 3) : null,
    })),
    totals: { feeTHB: feeTotal, views, engagements, clicks, orders },
    budgetFit,
    budgetFitTh,
    mixTh: mixText(items, views),
    timeline: timeline(objective, items),
    measurementPlanTh: measurementPlan(objective),
  };
}
