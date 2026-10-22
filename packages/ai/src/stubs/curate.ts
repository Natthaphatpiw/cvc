import {
  CuratorOutput,
  PortfolioNarrative,
  type BrandProfile,
  type CreatorDossier,
  type CreatorRole,
  type ExpectedKpis,
  type KolEvaluation,
  type PortfolioPlan,
  type RankedCreator,
} from '@cvc/schemas';
import { categoryLabel } from '../categories';
import { CONFIDENCE_TH, fmtCpv, fmtNumber, fmtPct, fmtTHBRange } from '../format';
import type { PlaybookHints } from '../types';

export type CurateCreatorArgs = {
  brand: BrandProfile;
  dossier: CreatorDossier;
  ranked: RankedCreator;
  evaluation: KolEvaluation | null;
  hints: PlaybookHints;
  kpis: ExpectedKpis;
};

export type CuratePortfolioArgs = { brand: BrandProfile; plan: PortfolioPlan; picks: { handle: string; role: CreatorRole; whyTh: string }[] };

const STORY_FORMATS = ['in_feed', 'live', 'affiliate', 'series'] as const;
type StoryFormat = (typeof STORY_FORMATS)[number];

export function storylineFormat(hints: PlaybookHints): StoryFormat {
  const f = hints.recommendedFormats.find((x): x is StoryFormat => (STORY_FORMATS as readonly string[]).includes(x));
  return f ?? 'in_feed';
}

const CTA_TH: Record<BrandProfile['campaign']['objective'], string> = {
  awareness: 'กดติดตามแบรนด์เพื่อดูเรื่องราวเพิ่มเติม',
  launch: 'ติดตามวันเปิดตัวและโปรโมชันแรกของแบรนด์',
  conversion: 'กดลิงก์ในโปรไฟล์เพื่อดูรายละเอียดและสั่งซื้อ',
  tiktok_shop: 'กดตะกร้าในคลิปเพื่อสั่งซื้อ',
  brand_building: 'กดติดตามแบรนด์และเล่าประสบการณ์ในคอมเมนต์',
  ugc: 'คอมเมนต์เล่าประสบการณ์การใช้สินค้าของคุณ',
};

const MISSING_FEATURE_TH: Record<string, string> = {
  growth: 'ไม่มีข้อมูลการเติบโตของผู้ติดตามย้อนหลัง',
  demo: 'ยังไม่มีข้อมูลประชากรผู้ชมที่เชื่อถือได้',
  semantic: 'ยังไม่ได้วัดความใกล้เคียงของเนื้อหากับแบรนด์',
  sponsored_perf: 'มีคลิปสปอนเซอร์ไม่พอสำหรับวัดผลงานโฆษณา',
  authenticity: 'ยังไม่ได้ตรวจความน่าเชื่อถือของผู้ติดตามจากคอมเมนต์',
  cpv: 'ยังคำนวณต้นทุนต่อวิวไม่ได้',
};

function productName(brand: BrandProfile): string {
  return brand.brand.products[0]?.name ?? `สินค้าของ ${brand.brand.name}`;
}

function roleReason(a: CurateCreatorArgs): string {
  const m = a.dossier.metrics;
  const shopCount = a.dossier.videos.filter((v) => v.hasShopProduct === true || v.isSponsored === true).length;
  switch (a.hints.role) {
    case 'hero_awareness':
      return `ยอดวิวกลางต่อคลิป ${fmtNumber(m.medianViews)} วิว จาก ${m.videosAnalyzed} คลิปล่าสุด จึงเหมาะกับบทบาทสร้างการรับรู้ในวงกว้าง`;
    case 'conversion_driver':
      return `มีคลิปที่ติดตะกร้าหรือเป็นงานสปอนเซอร์ ${shopCount} คลิปจาก ${a.dossier.videos.length} คลิปล่าสุด จึงเหมาะกับบทบาทกระตุ้นยอดขาย`;
    case 'community_trust':
      return `อัตราการมีส่วนร่วมต่อยอดวิว ${fmtPct(m.erViewsMedian)} แสดงว่าผู้ชมโต้ตอบกับคอนเทนต์ จึงเหมาะกับบทบาทสร้างความน่าเชื่อถือ`;
    case 'ugc_content':
      return 'เหมาะกับการผลิตคอนเทนต์ให้แบรนด์นำไปใช้ต่อ โดยดูคุณภาพคลิปเป็นหลักมากกว่ายอดวิว';
    case 'live_seller':
      return 'เหมาะกับการไลฟ์ขายสินค้า ควรตรวจประวัติการไลฟ์และยอดขายก่อนตกลงงาน';
  }
}

function collaborationNote(a: CurateCreatorArgs): string {
  const fee = fmtTHBRange(a.kpis.cost.feeTHB);
  switch (a.hints.collaborationModel) {
    case 'fixed_fee':
      return `แนะนำจ่ายค่าจ้างแบบคงที่ ช่วงประมาณ ${fee} ต่อคลิป (ค่าประมาณจากเรทการ์ดตามระดับผู้ติดตาม)`;
    case 'affiliate_commission':
      return 'แนะนำแบบค่าคอมมิชชันจากยอดขายผ่านลิงก์หรือตะกร้า เพื่อให้ค่าตอบแทนสัมพันธ์กับผลลัพธ์';
    case 'hybrid':
      return `แนะนำค่าจ้างคงที่บางส่วน (ช่วงค่าจ้างเต็มประมาณ ${fee}) ร่วมกับค่าคอมมิชชันจากยอดขาย`;
    case 'gifting':
      return 'แนะนำเริ่มจากการส่งสินค้าให้ทดลองใช้ก่อน แล้วค่อยเจรจางานที่มีค่าตอบแทน';
  }
}

type Risk = { riskTh: string; mitigationTh: string };

function risks(a: CurateCreatorArgs): Risk[] {
  const out: Risk[] = [];
  const m = a.dossier.metrics;
  if (a.ranked.suspectedInjection) {
    out.push({ riskTh: 'พบข้อความในโปรไฟล์หรือแคปชันที่อาจพยายามชี้นำระบบประเมิน', mitigationTh: 'ให้ทีมตรวจโปรไฟล์และคลิปด้วยตนเองก่อนติดต่อ' });
  }
  if (a.kpis.confidence === 'low') {
    out.push({ riskTh: `ข้อมูลย้อนหลังมีเพียง ${m.videosAnalyzed} คลิป ตัวเลขคาดการณ์จึงไม่แน่นอนสูง`, mitigationTh: 'เริ่มจากงานหนึ่งคลิปแล้ววัดผลก่อนขยายงาน' });
  }
  if (m.sponsoredShare != null && m.sponsoredShare > 0.4) {
    out.push({ riskTh: `คลิปสปอนเซอร์คิดเป็น ${fmtPct(m.sponsoredShare, 0)} ของคลิปล่าสุด ผู้ชมอาจเห็นโฆษณาถี่`, mitigationTh: 'เว้นระยะจากงานของแบรนด์อื่น และให้เล่าจากประสบการณ์ใช้จริง' });
  }
  for (const f of a.ranked.missingFeatures.slice(0, 2)) {
    const th = MISSING_FEATURE_TH[f];
    if (th) out.push({ riskTh: th, mitigationTh: 'ขอข้อมูลเพิ่มจากครีเอเตอร์ เช่น สถิติผู้ชมหรือผลงานโฆษณาที่ผ่านมา' });
  }
  // suitabilityTier is a brand-safety risk tier: medium/high = risky content seen.
  if (a.evaluation && a.evaluation.suitabilityTier !== 'low') {
    out.push({ riskTh: 'พบเนื้อหาที่อาจไม่ปลอดภัยต่อภาพลักษณ์แบรนด์', mitigationTh: 'ตรวจคลิปย้อนหลังและกำหนดข้อห้ามในบรีฟให้ชัดเจน' });
  }
  out.push({ riskTh: 'ผลงานจริงอาจต่างจากค่าคาดการณ์', mitigationTh: 'กำหนด KPI และติดตามผลด้วยลิงก์หรือโค้ดเฉพาะของครีเอเตอร์' });
  return out.slice(0, 4);
}

function topAges(dist: Record<string, number> | null | undefined): string {
  return Object.entries(dist ?? {})
    .sort((x, y) => y[1] - x[1])
    .slice(0, 2)
    .map(([k]) => k)
    .join(', ');
}

/** Fit paragraph: content match, audience overlap with the brand's segments, performance, then the main caveat. */
function fitSummary(a: CurateCreatorArgs, label: string, mainRisk: string | undefined): string {
  const { dossier: d, brand } = a;
  const m = d.metrics;
  const segments = brand.audience.segments.slice(0, 2).map((s) => s.label);
  const customers = segments.length ? `กลุ่มลูกค้า ${segments.join(' และ ')}` : 'กลุ่มลูกค้าของแบรนด์';
  const ages = topAges(d.audience?.ageDist);
  const female = d.audience?.genderDist ? (d.audience.genderDist.female ?? d.audience.genderDist.f ?? null) : null;
  const gender = female === null ? '' : female >= 0.6 ? ' ส่วนใหญ่เป็นผู้หญิง' : female <= 0.4 ? ' ส่วนใหญ่เป็นผู้ชาย' : ' ทั้งผู้หญิงและผู้ชาย';
  const relevance = a.evaluation?.rubric.find((x) => x.criterion === 'content_product_relevance');
  return [
    `@${d.profile.handle} ทำคอนเทนต์สาย${label}ที่${relevance && relevance.score >= 2 ? 'ตรง' : 'ใกล้เคียง'}กับสินค้าของ ${brand.brand.name}`,
    ages
      ? `ผู้ชมส่วนใหญ่อายุ ${ages} ปี${gender} (ค่าประมาณ) จึงใกล้เคียงกับ${customers}`
      : `ยังไม่มีข้อมูลผู้ชมที่ชัดเจน จึงประเมินความเข้ากับ${customers}จากเนื้อหาเป็นหลัก`,
    m.medianViews != null ? `ยอดวิวกลางต่อคลิป ${fmtNumber(m.medianViews)} วิว และอัตราการมีส่วนร่วม ${fmtPct(m.erViewsMedian)} ช่วยให้ข้อความของแบรนด์ไปถึงผู้ชมได้จริง` : '',
    mainRisk ? `ข้อควรระวังหลักคือ${mainRisk}` : '',
  ]
    .filter((x) => x.length > 0)
    .join(' ');
}

/** Deterministic Thai narrative built only from computed numbers and the inputs. */
export function buildStubCuratorOutput(a: CurateCreatorArgs): CuratorOutput {
  const { dossier: d, ranked: r, kpis: k, brand } = a;
  const m = d.metrics;
  const handle = d.profile.handle;
  const product = productName(brand);
  const label = categoryLabel(brand.brand.industryId);
  const videosByViews = [...d.videos].filter((v) => v.views != null).sort((x, y) => (y.views ?? 0) - (x.views ?? 0));

  const why: CuratorOutput['whyMatchTh'] = [];
  if (m.medianViews != null) why.push({ text: `ยอดวิวกลางต่อคลิป ${fmtNumber(m.medianViews)} วิว จาก ${m.videosAnalyzed} คลิปล่าสุดที่วิเคราะห์`, evidenceRefs: [] });
  if (m.erViewsMedian != null) why.push({ text: `อัตราการมีส่วนร่วมต่อยอดวิว (ER) ${fmtPct(m.erViewsMedian)}`, evidenceRefs: [] });
  why.push({ text: `คะแนนความเหมาะสมรวม ${fmtNumber(r.total)} จาก 100 อยู่อันดับที่ ${r.rank} ของรายการนี้`, evidenceRefs: [] });
  const relevance = a.evaluation?.rubric.find((x) => x.criterion === 'content_product_relevance');
  if (relevance) {
    why.push({ text: `ผลประเมินด้านความเกี่ยวข้องกับหมวด${label.th} ได้ ${relevance.score} จาก 2 คะแนน: ${relevance.noteTh}`, evidenceRefs: relevance.evidenceVideoIds.slice(0, 3) });
  }
  why.push({
    text: `คาดว่ายอดวิวต่อโพสต์อยู่ราว ${fmtNumber(k.perPost.views.p25)}–${fmtNumber(k.perPost.views.p75)} วิว (ค่าประมาณ ความมั่นใจ${CONFIDENCE_TH[k.confidence]})`,
    evidenceRefs: [],
  });

  const riskList = risks(a);
  const negotiation = [`ช่วงค่าจ้างโดยประมาณ ${fmtTHBRange(k.cost.feeTHB)} ต่อคลิป ใช้เป็นจุดเริ่มต้นการเจรจา`];
  if (k.cost.cpv) negotiation.push(`ต้นทุนต่อวิวที่คาดไว้ประมาณ ${fmtCpv(k.cost.cpv.p50)} ต่อวิว (ค่าประมาณ)`);
  negotiation.push('ตกลงสิทธิ์การนำคลิปไปใช้ต่อและระยะเวลาให้ชัดเจนในสัญญา');

  const donts = ['ห้ามกล่าวอ้างสรรพคุณเกินจริงหรือเกินกว่าที่แบรนด์ยืนยันได้', 'ไม่บังคับสคริปต์จนคลิปดูเป็นโฆษณาเกินไป'];
  const regulated = brand.brand.regulatedCategory;
  if (regulated === 'cosmetics') donts.push('ไม่ใช้คำว่ารักษาหรือหายขาดกับเครื่องสำอาง');
  if (regulated === 'supplement') donts.push('ไม่อ้างผลทางการรักษา และใช้ข้อความตามที่ได้รับอนุญาตจาก อย.');
  if (regulated === 'alcohol') donts.push('ไม่ชวนดื่มหรือแสดงภาพการดื่ม ตามกฎหมายควบคุมเครื่องดื่มแอลกอฮอล์');
  if (regulated === 'finance') donts.push('ไม่การันตีผลตอบแทน และแสดงคำเตือนความเสี่ยงให้ครบ');

  const output: CuratorOutput = {
    creatorId: d.creatorId,
    whyMatchTh: why.slice(0, 5),
    risksTh: riskList.map((x) => x.riskTh),
    fitSummaryTh: fitSummary(a, label.th, riskList[0]?.riskTh),
    storyline: {
      conceptTh: `@${handle} เล่าประสบการณ์ใช้ ${product} ในสไตล์ของตัวเอง โดยเน้น${brand.matchingQueries.criteria[0]?.textTh ?? `ประเด็นที่ผู้ชมสาย${label.th}สนใจ`}`,
      hookTh: 'เปิดคลิปด้วยปัญหาที่ผู้ชมเจอบ่อย แล้วหยิบสินค้าขึ้นมาให้เห็นภายใน 3 วินาทีแรก',
      format: storylineFormat(a.hints),
      ctaTh: CTA_TH[brand.campaign.objective],
      sampleCaptionTh: `ลองใช้ ${product} มาแล้ว เล่าให้ฟังแบบตรงๆ #โฆษณา`,
      disclosure: '#โฆษณา',
    },
    pitchAnglesTh: [
      `ชวน @${handle} ร่วมงานโดยชี้ว่าสินค้าตรงกับเนื้อหาสาย${label.th}ที่ทำอยู่`,
      'เสนอให้ครีเอเตอร์ออกแบบมุมเล่าเองภายใต้บรีฟสั้นๆ เพื่อรักษาความเป็นตัวเอง',
    ],
    topVideoNotes: videosByViews.slice(0, 3).map((v, i) => ({
      videoId: v.platformVideoId,
      whyTh: `คลิปนี้มียอดวิว ${fmtNumber(v.views)} วิว สูงเป็นอันดับ ${i + 1} จากคลิปที่วิเคราะห์ ใช้เป็นตัวอย่างสไตล์ที่ได้ผล`,
    })),
    playbookText: {
      roleReasonTh: roleReason(a),
      collaborationNoteTh: collaborationNote(a),
      contentAnglesTh: [
        `รีวิวการใช้ ${product} ในชีวิตประจำวันของครีเอเตอร์`,
        `เปรียบเทียบก่อนและหลังใช้ ${product} แบบตรงไปตรงมา`,
        `ตอบคำถามที่ผู้ชมถามบ่อยเกี่ยวกับ${label.th}`,
      ],
      briefDosTh: ['ใส่ #โฆษณา และเปิดการแจ้งเนื้อหาเชิงพาณิชย์ทุกคลิป', 'ให้ครีเอเตอร์เล่าด้วยภาษาและสไตล์ของตัวเอง', 'สื่อสารจุดเด่นของสินค้าไม่เกินสองถึงสามข้อต่อคลิป'],
      briefDontsTh: donts,
      negotiationTh: negotiation,
      riskMitigations: riskList,
    },
  };
  return CuratorOutput.parse(output);
}

export function buildStubPortfolioNarrative(a: CuratePortfolioArgs): PortfolioNarrative {
  const t = a.plan.totals;
  const handles = a.picks.map((p) => `@${p.handle}`).join(', ');
  return PortfolioNarrative.parse({
    headlineTh: `แนะนำครีเอเตอร์ ${a.picks.length} คน คาดยอดวิวรวมราว ${fmtNumber(t.views.p50)} วิวต่อรอบโพสต์ (ค่าประมาณ) ค่าจ้างรวมประมาณ ${fmtTHBRange(t.feeTHB)}`,
    consultantSummaryTh: [
      `ชุดครีเอเตอร์นี้คัดจากคะแนนความเหมาะสมกับแบรนด์ ${a.brand.brand.name} และเป้าหมาย ${a.brand.campaign.objective}`,
      a.plan.budgetFitTh,
      'ตัวเลขยอดวิวและค่าจ้างทั้งหมดเป็นค่าประมาณจากข้อมูลย้อนหลังและเรทการ์ด ควรยืนยันกับครีเอเตอร์ก่อนตัดสินใจ',
    ]
      .filter(Boolean)
      .join(' '),
    mixTh: a.plan.mixTh || `ประกอบด้วย ${handles}`,
    nextStepsTh: [
      'ทีมวางแผนตรวจรายชื่อและยืนยันครีเอเตอร์ที่จะติดต่อ',
      'ส่งบรีฟและขอเรทจริงจากครีเอเตอร์แต่ละคน',
      'ตั้งลิงก์หรือโค้ดติดตามผลเฉพาะของแต่ละคนก่อนเริ่มโพสต์',
      ...a.plan.measurementPlanTh.slice(0, 2),
    ].slice(0, 5),
  });
}
