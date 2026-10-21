import type { Confidence, CreatorMetrics, ExpectedKpis, KpiRange, MinMax, Objective, RefData, Tier } from '@cvc/schemas';
import { ER_SHRINK_K, TIER_LABEL_TH } from './presets';
import { feeMid, hasFee, kpiBenchmark, tierBenchmark, uniqueSources } from './ref';
import { clamp, fmtInt, fmtPct, fmtTHBRange, isNum, round } from './stats';

const MIN_VIDEOS_FOR_HISTORY = 5;
const MIN_SPONSORED_FOR_FACTOR = 3;
const DEFAULT_SPONSORED_FACTOR = 0.8;
const ASSUMPTION_SOURCE = 'assumption_to_calibrate';
const ASSUMPTION_SUFFIX = ' (สมมติฐาน รอปรับเทียบกับข้อมูลแคมเปญจริง)';

const suffixFor = (source: string | null | undefined): string => (source === ASSUMPTION_SOURCE || !source ? ASSUMPTION_SUFFIX : '');
const tierTh = (tier: Tier | null): string => (tier ? `ระดับ${TIER_LABEL_TH[tier]}` : 'ระดับเดียวกัน');

/** Views / engagements: exact below 1,000, then to 10 / 100 / 1,000 so estimates do not look falsely precise. */
export function roundCount(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x < 1_000) return Math.round(x);
  if (x < 100_000) return Math.round(x / 10) * 10;
  if (x < 1_000_000) return Math.round(x / 100) * 100;
  return Math.round(x / 1_000) * 1_000;
}

const mapRange = (r: KpiRange, f: (x: number) => number): KpiRange => ({ p25: f(r.p25), p50: f(r.p50), p75: f(r.p75) });
const sortedRange = (r: KpiRange): KpiRange => {
  const [p25, p50, p75] = [r.p25, r.p50, r.p75].sort((a, b) => a - b) as [number, number, number];
  return { p25, p50, p75 };
};

/**
 * Approximate days between the oldest and newest analyzed clip (computeMetrics applies no maximum age), recovered
 * from the posting cadence because CreatorMetrics keeps no per-clip dates. null when there is no cadence.
 */
function analyzedSpanDays(m: CreatorMetrics): number | null {
  const n = m.videosAnalyzed;
  if (n === 1) return 1;
  if (n < 1 || !isNum(m.postsPerWeek) || m.postsPerWeek <= 0) return null;
  return Math.max(1, Math.round(((n - 1) * 7) / m.postsPerWeek));
}

/**
 * Expected per-post KPIs from the creator's own history and agency benchmarks (see docs/CONTRACTS.md).
 * views = organic p25/p50/p75 × sponsoredFactor; engagements = views × erViews; cpv p25 = fee.min / views.p75 …
 * p75 = fee.max / views.p25; conversion (clicks / orders) only for conversion and tiktok_shop.
 */
export function computeExpectedKpis(args: {
  metrics: CreatorMetrics;
  tier: Tier | null;
  fee: MinMax;
  objective: Objective;
  categoryId: string | null;
  ref: RefData;
}): ExpectedKpis {
  const { metrics: m, tier, fee, objective, categoryId, ref } = args;
  const notes: string[] = [];
  const sources: (string | null)[] = [];
  const n = m.videosAnalyzed;
  const spanDays = analyzedSpanDays(m);

  // --- organic view distribution -------------------------------------------------------------
  let creator: KpiRange | null = null;
  let organicScaled = false;
  if (n > 0 && isNum(m.medianViews) && m.medianViews > 0) {
    const p50 = m.medianViews;
    const scale = isNum(m.medianViewsOrganic) && m.medianViewsOrganic > 0 ? m.medianViewsOrganic / p50 : 1;
    organicScaled = scale !== 1;
    creator = mapRange({ p25: m.p25Views ?? p50, p50, p75: m.p75Views ?? p50 }, (x) => x * scale);
  }
  const viewsBench = tierBenchmark(ref, tier, 'median_views', categoryId);

  let method: ExpectedKpis['basis']['method'];
  let organic: KpiRange;
  if (creator && n >= MIN_VIDEOS_FOR_HISTORY) {
    method = 'creator_history';
    organic = creator;
    const span = spanDays === null ? '' : ` ซึ่งโพสต์ในช่วงราว ${fmtInt(spanDays)} วัน`;
    notes.push(`คำนวณยอดวิวจาก ${n} คลิปล่าสุด${span} (ไม่นับคลิปที่โพสต์ไม่ถึง 48 ชั่วโมง)`);
  } else if (creator && viewsBench) {
    method = 'mixed';
    const w = n / MIN_VIDEOS_FOR_HISTORY;
    const b = viewsBench;
    // Geometric blend: view counts are roughly log-normal.
    const blend = (c: number, bv: number) => Math.exp(w * Math.log(Math.max(c, 1)) + (1 - w) * Math.log(Math.max(bv, 1)));
    organic = { p25: blend(creator.p25, b.p25), p50: blend(creator.p50, b.p50), p75: blend(creator.p75, b.p75) };
    sources.push(b.source);
    notes.push(
      `มีคลิปให้วิเคราะห์เพียง ${n} คลิป จึงผสมยอดวิวของครีเอเตอร์ (${Math.round(w * 100)}%) กับค่ามาตรฐานของ${tierTh(tier)}${suffixFor(b.source)}`,
    );
  } else if (viewsBench) {
    method = 'tier_benchmark';
    organic = { p25: viewsBench.p25, p50: viewsBench.p50, p75: viewsBench.p75 };
    sources.push(viewsBench.source);
    notes.push(
      `มีคลิปให้วิเคราะห์ไม่ถึง ${MIN_VIDEOS_FOR_HISTORY} คลิป จึงใช้ยอดวิวมาตรฐานของ${tierTh(tier)} (มัธยฐาน ${fmtInt(viewsBench.p50)} วิว)${suffixFor(viewsBench.source)}`,
    );
  } else if (creator) {
    method = 'creator_history';
    organic = creator;
    notes.push(`คำนวณยอดวิวจากเพียง ${n} คลิปล่าสุด และไม่มีค่ามาตรฐานของระดับครีเอเตอร์ให้เทียบ ตัวเลขจึงคลาดเคลื่อนได้มาก`);
  } else {
    method = 'tier_benchmark';
    organic = { p25: 0, p50: 0, p75: 0 };
    notes.push('ไม่มีข้อมูลยอดวิวและไม่ทราบระดับของครีเอเตอร์ จึงยังประมาณผลลัพธ์ไม่ได้');
  }
  if (organicScaled && method !== 'tier_benchmark') notes.push('ใช้ยอดวิวของคลิปทั่วไปที่ไม่มีสปอนเซอร์เป็นฐานก่อนปรับด้วยสัดส่วนคลิปสปอนเซอร์');

  // --- sponsored factor ----------------------------------------------------------------------
  let factor: number;
  let factorSource: ExpectedKpis['basis']['sponsoredFactorSource'];
  if (
    m.sponsoredCount >= MIN_SPONSORED_FOR_FACTOR &&
    isNum(m.medianViewsSponsored) &&
    isNum(m.medianViewsOrganic) &&
    m.medianViewsOrganic > 0
  ) {
    const rawFactor = m.medianViewsSponsored / m.medianViewsOrganic;
    factor = clamp(rawFactor, 0.3, 1.5);
    factorSource = 'creator_history';
    notes.push(
      `คลิปสปอนเซอร์ของครีเอเตอร์ได้ยอดวิวราว ${fmtPct(factor, 0)} ของคลิปทั่วไป (จาก ${m.sponsoredCount} คลิปสปอนเซอร์)` +
        (factor !== rawFactor ? ' โดยจำกัดไว้ในช่วง 30–150%' : ''),
    );
  } else {
    const row = kpiBenchmark(ref, 'sponsored_view_factor', { objective, categoryId, tier });
    factor = row?.p50 ?? DEFAULT_SPONSORED_FACTOR;
    factorSource = 'benchmark';
    sources.push(row?.source ?? 'default_assumption');
    notes.push(
      `ครีเอเตอร์มีคลิปสปอนเซอร์ไม่ถึง ${MIN_SPONSORED_FOR_FACTOR} คลิป จึงใช้ค่ามาตรฐานว่าคลิปสปอนเซอร์ได้ยอดวิวราว ${fmtPct(factor, 0)} ของคลิปทั่วไป${suffixFor(row?.source)}`,
    );
  }
  factor = round(factor, 3);
  const views = sortedRange(mapRange(organic, (x) => roundCount(x * factor)));

  // --- engagement rate (views-based, saves excluded) -----------------------------------------
  const erTier = tierBenchmark(ref, tier, 'er_views', categoryId);
  const erKpi = erTier ? null : kpiBenchmark(ref, 'er_views', { objective, categoryId, tier });
  const erRef = erTier?.p50 ?? erKpi?.p50 ?? null;
  const erRefSource = erTier?.source ?? erKpi?.source ?? null;
  let erViews: number | null = null;
  if (isNum(m.erViewsMedian) && erRef !== null) {
    erViews = (n * m.erViewsMedian + ER_SHRINK_K * erRef) / (n + ER_SHRINK_K);
    sources.push(erRefSource);
    notes.push(
      `อัตราการมีส่วนร่วมต่อวิวของครีเอเตอร์ ${fmtPct(m.erViewsMedian)} ปรับเข้าหาค่ามาตรฐานของ${tierTh(tier)} (${fmtPct(erRef)}) ตามจำนวนคลิป ได้ ${fmtPct(erViews)} (ไม่นับการบันทึกคลิป)`,
    );
  } else if (isNum(m.erViewsMedian)) {
    erViews = m.erViewsMedian;
    notes.push(`ใช้อัตราการมีส่วนร่วมต่อวิวของครีเอเตอร์ ${fmtPct(erViews)} (ไม่นับการบันทึกคลิป)`);
  } else if (erRef !== null) {
    erViews = erRef;
    sources.push(erRefSource);
    notes.push(`ไม่มีข้อมูลการมีส่วนร่วมของครีเอเตอร์ จึงใช้ค่ามาตรฐานของ${tierTh(tier)} ${fmtPct(erRef)}`);
  } else {
    notes.push('ไม่มีข้อมูลอัตราการมีส่วนร่วม จึงยังประมาณยอดเอ็นเกจไม่ได้');
  }
  if (erViews !== null) erViews = round(erViews, 4);
  const er = erViews ?? 0;
  const engagements = mapRange(views, (v) => roundCount(v * er));

  // --- cost ------------------------------------------------------------------------------------
  const feeOk = hasFee(fee);
  const cpv: KpiRange | null =
    feeOk && views.p25 > 0
      ? { p25: round(fee.min / views.p75, 2), p50: round(feeMid(fee) / views.p50, 2), p75: round(fee.max / views.p25, 2) }
      : null;
  const cpe = feeOk && engagements.p50 > 0 ? round(feeMid(fee) / engagements.p50, 2) : null;
  if (cpv) notes.push(`ต้นทุนต่อวิวคำนวณจากค่าจ้างประมาณ ${fmtTHBRange(fee)} หารด้วยยอดวิวที่คาดการณ์`);
  else if (!feeOk) notes.push('ยังไม่มีค่าจ้างประมาณการ จึงไม่คำนวณต้นทุนต่อวิว');

  // --- conversion (conversion / tiktok_shop only) ----------------------------------------------
  let conversion: ExpectedKpis['conversion'] = null;
  if (objective === 'conversion' || objective === 'tiktok_shop') {
    const q = { objective, categoryId, tier };
    const ctr = kpiBenchmark(ref, 'ctr', q);
    const cvr = kpiBenchmark(ref, 'cvr', q);
    if (ctr && cvr) {
      const clicksExact = { p25: views.p25 * ctr.p25, p50: views.p50 * ctr.p50, p75: views.p75 * ctr.p75 };
      const clickLabel = objective === 'tiktok_shop' ? 'อัตรากดตะกร้า' : 'อัตราคลิก';
      conversion = {
        clicks: mapRange(clicksExact, Math.round),
        orders: { p25: Math.round(clicksExact.p25 * cvr.p25), p50: Math.round(clicksExact.p50 * cvr.p50), p75: Math.round(clicksExact.p75 * cvr.p75) },
        assumptions: { ctr: ctr.p50, cvr: cvr.p50, source: uniqueSources([ctr.source, cvr.source]).join(', ') },
      };
      sources.push(ctr.source, cvr.source);
      notes.push(`ใช้ค่ามาตรฐาน${clickLabel} ${fmtPct(ctr.p50)} (ช่วง ${fmtPct(ctr.p25)}–${fmtPct(ctr.p75)})${suffixFor(ctr.source)}`);
      notes.push(`ใช้ค่ามาตรฐานอัตราการสั่งซื้อต่อคลิก ${fmtPct(cvr.p50)} (ช่วง ${fmtPct(cvr.p25)}–${fmtPct(cvr.p75)})${suffixFor(cvr.source)}`);
    } else {
      notes.push('ยังไม่มีค่ามาตรฐานอัตราคลิกหรืออัตราการสั่งซื้อสำหรับเป้าหมายนี้ จึงไม่ประมาณยอดคลิกและยอดสั่งซื้อ');
    }
  }

  let confidence: Confidence;
  if (method === 'tier_benchmark') confidence = 'low';
  else if (method === 'creator_history' && n >= 15 && factorSource === 'creator_history') confidence = 'high';
  else if (n >= 8) confidence = 'medium';
  else confidence = 'low';

  return {
    perPost: { views, engagements, erViews },
    cost: { feeTHB: { min: fee.min, max: fee.max }, cpv, cpe },
    conversion,
    basis: {
      method,
      videosAnalyzed: n,
      sponsoredVideosAnalyzed: m.sponsoredCount,
      sponsoredFactor: factor,
      sponsoredFactorSource: factorSource,
      // 0 = unknown span
      windowDays: spanDays ?? 0,
      benchmarkSources: uniqueSources(sources),
      notesTh: notes,
    },
    confidence,
  };
}
