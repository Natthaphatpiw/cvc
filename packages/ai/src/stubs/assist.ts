import { REF_SEED, type AssistRequest, type AssistResponse, type AudiencePersona, type MinMax, type Objective } from '@cvc/schemas';
import { categoryKeywords, categoryLabel, matchCategories } from '../categories';
import { fmtTHBRange, OBJECTIVE_LABEL_TH } from '../format';
import { clamp, hasKeyword, truncate } from '../text';

/** Personas the audience assist may return (spec: 1-4). */
export const ASSIST_MAX_PERSONAS = 4;
const STUB_DEFAULT_CREATORS = 5;

const lower = (text: string): string => text.normalize('NFC').toLowerCase();

/**
 * The need mentions an amount of money: a Thai or English money word, a currency sign, or a number of four or more
 * digits. Code drops a model budget when this is false, so a budget only appears when the planner asked for one.
 */
export function moneyMentioned(text: string): boolean {
  return /งบ|บาท|แสน|หมื่น|ล้าน|พัน|฿|baht|thb|budget|\d\s*k(?![a-z])|\d[\d,]{3,}/i.test(text.normalize('NFC'));
}

/** min <= max, both positive whole baht; a single amount becomes min = max. null when neither is usable. */
export function budgetRange(a: number | null | undefined, b: number | null | undefined): MinMax | null {
  const xs = [a, b].filter((x): x is number => x != null && Number.isFinite(x) && x > 0).map((x) => Math.round(x));
  if (xs.length === 0) return null;
  return { min: Math.min(...xs), max: Math.max(...xs) };
}

const UNIT: Record<string, number> = { พัน: 1_000, หมื่น: 10_000, แสน: 100_000, ล้าน: 1_000_000, k: 1_000, m: 1_000_000 };
const AMOUNT = String.raw`(\d+(?:,\d{3})*(?:\.\d+)?)\s*(พัน|หมื่น|แสน|ล้าน|k(?![a-z])|m(?![a-z]))?`;
const RANGE_RE = new RegExp(String.raw`${AMOUNT}\s*(?:-|–|ถึง|to)\s*${AMOUNT}`, 'g');
const SINGLE_RE = new RegExp(AMOUNT, 'g');
/** Words right before an amount that make it money (งบ 2 แสน, ฿50,000). */
const MONEY_BEFORE = /(งบ|budget|฿)[^\d]{0,12}$/;
/** Words right after an amount that make it money (2 แสนบาท). */
const MONEY_AFTER = /^\s*(บาท|baht|thb|฿)/;
/** Words right before an amount that make it a product price, not a budget (ราคา 990 บาท). */
const PRICE_BEFORE = /(ราคา|price)[^\d]{0,8}$/;

const toBaht = (num: string, unit: string | undefined): number => Number(num.replace(/,/g, '')) * (unit ? (UNIT[unit] ?? 1) : 1);

/**
 * Deterministic THB budget from Thai text ("งบราว 2 แสน", "1-2 แสนบาท", "50,000 บาท", "200k"). Only an amount next to
 * a money word counts, and not a product price (ราคา 990 บาท); years, view or follower counts are never a budget.
 */
export function parseBudgetTh(text: string): MinMax | null {
  const t = lower(text);
  type Found = { range: MinMax; money: boolean; index: number };
  const found: Found[] = [];
  const covered: [number, number][] = [];
  const judge = (index: number, end: number, range: MinMax | null) => {
    if (!range) return;
    const before = t.slice(Math.max(0, index - 16), index);
    const after = t.slice(end, end + 12);
    const money = !PRICE_BEFORE.test(before) && (MONEY_BEFORE.test(before) || MONEY_AFTER.test(after));
    found.push({ range, money, index });
  };
  for (const m of t.matchAll(RANGE_RE)) {
    const [whole, n1 = '', u1, n2 = '', u2] = m;
    const index = m.index ?? 0;
    covered.push([index, index + whole.length]);
    judge(index, index + whole.length, budgetRange(toBaht(n1, u1 ?? u2), toBaht(n2, u2 ?? u1)));
  }
  for (const m of t.matchAll(SINGLE_RE)) {
    const [whole, n = '', u] = m;
    const index = m.index ?? 0;
    if (covered.some(([a, b]) => index >= a && index < b)) continue;
    judge(index, index + whole.length, budgetRange(toBaht(n, u), null));
  }
  found.sort((a, b) => a.index - b.index);
  return found.find((f) => f.money)?.range ?? null;
}

/** "5 คน", "ครีเอเตอร์ 8 คน", "3 creators" → clamped 1-10; null when the text gives no count. */
export function parseCreatorCount(text: string): number | null {
  const m = /(\d{1,2})\s*(?:คน|ครีเอเตอร์|creators?(?![a-z])|kols?(?![a-z])|อินฟลู|influencers?(?![a-z]))/i.exec(lower(text));
  return m?.[1] ? Math.round(clamp(Number(m[1]), 1, 10)) : null;
}

/** Objective cues in the need, checked in this order (a TikTok Shop sales goal is more specific than "ยอดขาย"). */
const OBJECTIVE_CUE_WORDS: { objective: Objective; keywords: string[]; reasonTh: string }[] = [
  { objective: 'tiktok_shop', keywords: ['tiktok shop', 'ติ๊กต็อกช็อป', 'ตะกร้า', 'ไลฟ์ขาย', 'ไลฟ์สด', 'ขายผ่านไลฟ์', 'affiliate'], reasonTh: 'คำอธิบายเน้นการขายผ่าน TikTok Shop หรือไลฟ์' },
  { objective: 'launch', keywords: ['เปิดตัว', 'สินค้าใหม่', 'ตัวใหม่', 'launch'], reasonTh: 'คำอธิบายพูดถึงการเปิดตัวสินค้าใหม่' },
  { objective: 'ugc', keywords: ['ugc', 'คอนเทนต์ไปใช้', 'คลิปไปใช้', 'นำไปใช้ต่อ'], reasonTh: 'คำอธิบายต้องการคอนเทนต์ไปใช้ต่อในช่องทางของแบรนด์' },
  { objective: 'brand_building', keywords: ['สร้างแบรนด์', 'ภาพลักษณ์', 'ระยะยาว', 'brand building', 'branding'], reasonTh: 'คำอธิบายเน้นการสร้างภาพลักษณ์ของแบรนด์ในระยะยาว' },
  { objective: 'awareness', keywords: ['การรับรู้', 'รับรู้', 'awareness', 'reach', 'เป็นที่รู้จัก', 'คนรู้จัก', 'ยอดวิว'], reasonTh: 'คำอธิบายเน้นให้คนรู้จักแบรนด์ในวงกว้าง' },
  { objective: 'conversion', keywords: ['ยอดขาย', 'เพิ่มยอด', 'conversion', 'สั่งซื้อ', 'ปิดการขาย', 'ลิงก์'], reasonTh: 'คำอธิบายเน้นการกระตุ้นยอดขาย' },
];

export function stubObjective(text: string): { objective: Objective; reasonTh: string } {
  const t = lower(text);
  const cue = OBJECTIVE_CUE_WORDS.find((c) => c.keywords.some((k) => hasKeyword(t, k)));
  return cue ?? { objective: 'conversion', reasonTh: 'คำอธิบายไม่ได้ระบุเป้าหมาย จึงเริ่มจากเป้าหมายที่ใช้บ่อยที่สุดคือการเพิ่มยอดขาย' };
}

/**
 * Catalog personas that fit the need, best first: a category hint whose category the text names counts 2, an interest
 * the text names (directly or through its category keywords) 1, the persona's own label 3. Ties keep catalog order.
 */
export function matchPersonas(text: string, personas: readonly AudiencePersona[]): AudiencePersona[] {
  const t = lower(text);
  const matched = matchCategories(t, REF_SEED.categories).map((m) => REF_SEED.categories.find((c) => c.id === m.id));
  const hinted = new Set(matched.flatMap((c) => (c ? [c.id, c.parentId].filter((x): x is string => x != null) : [])));
  const scored = personas.map((p, i) => {
    let score = 0;
    for (const h of new Set(p.categoryHints)) if (hinted.has(h)) score += 2;
    for (const interest of new Set(p.interests)) {
      if (hasKeyword(t, interest) || categoryKeywords(interest).some((k) => hasKeyword(t, k))) score += 1;
    }
    if (hasKeyword(t, p.labelTh.toLowerCase()) || hasKeyword(t, p.labelEn.toLowerCase())) score += 3;
    return { p, i, score };
  });
  const top = Math.max(0, ...scored.map((s) => s.score));
  if (top === 0) return [];
  return scored
    .filter((s) => s.score >= Math.max(1, top / 2))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 3)
    .map((s) => s.p);
}

/** "18-44 ปี" / "45 ปีขึ้นไป" over the age bands that hold at least a fifth of each persona. */
function ageRangeTh(personas: readonly AudiencePersona[]): string | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi: number | null = 0;
  for (const p of personas) {
    for (const [band, share] of Object.entries(p.ageDist)) {
      const m = /^(\d+)(?:-(\d+)|\+)$/.exec(band);
      if (!m?.[1] || share < 0.2) continue;
      lo = Math.min(lo, Number(m[1]));
      hi = m[2] && hi != null ? Math.max(hi, Number(m[2])) : null;
    }
  }
  if (!Number.isFinite(lo)) return null;
  return hi == null ? `${lo} ปีขึ้นไป` : `${lo}-${hi} ปี`;
}

/** "ก", "ก และข", "ก, ข และค" */
function listTh(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} และ${items[items.length - 1]}`;
}

function stubAudience(req: AssistRequest, personas: readonly AudiencePersona[]): AssistResponse {
  const chosen = matchPersonas(req.promptTh, personas).slice(0, ASSIST_MAX_PERSONAS);
  if (chosen.length === 0) {
    return {
      section: 'audience',
      audience: { personaIds: [], audienceNotes: truncate(`กลุ่มลูกค้าที่แบรนด์ต้องการ: ${req.promptTh}`, 2000) },
      noteTh: 'ยังไม่พบกลุ่มลูกค้าในรายการที่ตรงกับคำอธิบาย จึงใส่คำอธิบายของคุณไว้ในหมายเหตุให้แก้ต่อได้',
    };
  }
  const ages = ageRangeTh(chosen);
  const descriptions = chosen.map((p) => p.descriptionTh).filter((d): d is string => Boolean(d));
  const category = matchCategories(lower(req.promptTh), REF_SEED.categories)[0];
  const buying = 'มักตัดสินใจซื้อจากรีวิวหรือคลิปแนะนำสินค้าบน TikTok';
  const notes = [
    `กลุ่มลูกค้าหลักคือ ${listTh(chosen.map((p) => p.labelTh))}${ages ? ` อายุส่วนใหญ่ราว ${ages}` : ''}`,
    descriptions.length ? `ลักษณะเด่น: ${descriptions.join(' / ')}` : '',
    category ? `สนใจสินค้าหมวด${categoryLabel(category.id).th} และ${buying}` : buying,
  ].filter(Boolean);
  return {
    section: 'audience',
    audience: { personaIds: chosen.map((p) => p.id), audienceNotes: truncate(notes.join(' '), 2000) },
    noteTh: `เลือกกลุ่มลูกค้า ${chosen.length} กลุ่มที่ตรงกับคำอธิบายมากที่สุด ตรวจสอบและแก้ไขได้ก่อนส่ง`,
  };
}

function stubCampaign(req: AssistRequest): AssistResponse {
  const { objective, reasonTh } = stubObjective(req.promptTh);
  const budgetTHB = moneyMentioned(req.promptTh) ? parseBudgetTh(req.promptTh) : null;
  const nCreators = parseCreatorCount(req.promptTh) ?? STUB_DEFAULT_CREATORS;
  const budget = budgetTHB ? ` งบ ${fmtTHBRange(budgetTHB)}` : '';
  return {
    section: 'campaign',
    campaign: { objective, budgetTHB, nCreators },
    noteTh: `แนะนำเป้าหมาย${OBJECTIVE_LABEL_TH[objective]}${budget} กับครีเอเตอร์ ${nCreators} คน เพราะ${reasonTh}`,
  };
}

/** Deterministic stand-in for the form assist: keyword matching over the persona catalog, objective cues, budget regex. */
export function buildStubAssist(req: AssistRequest, personas: readonly AudiencePersona[]): AssistResponse {
  return req.section === 'audience' ? stubAudience(req, personas) : stubCampaign(req);
}
