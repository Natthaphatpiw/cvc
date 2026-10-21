import { BrandProfile, type AudiencePersona, type Category, type EvidenceCard, type InputBrief, type Objective } from '@cvc/schemas';
import { categoryKeywords, followerRangeForTiers, guessCategory, regulatedFor } from '../categories';
import { evidenceRef } from '../prompts/brand';
import { clamp, tiktokHandleFromUrl, truncate, uniqText } from '../text';

export type ResearchBrandArgs = {
  brief: InputBrief;
  evidence: EvidenceCard[];
  personas: AudiencePersona[];
  categories: Category[];
  allowWebSearch: boolean;
};

const URL_SOURCES: { key: keyof InputBrief['urls']; source: string; covers: EvidenceCard['source'][] }[] = [
  { key: 'website', source: 'website', covers: ['website'] },
  { key: 'facebook', source: 'facebook_page', covers: ['facebook_page', 'facebook_posts'] },
  { key: 'tiktok', source: 'tiktok', covers: ['tiktok'] },
  { key: 'youtube', source: 'youtube', covers: ['youtube'] },
  { key: 'instagram', source: 'instagram', covers: ['instagram'] },
];

/** Source types the brief lists but no evidence card covers. */
export function unavailableSources(brief: InputBrief, evidence: EvidenceCard[]): string[] {
  const have = new Set(evidence.map((e) => e.source));
  return URL_SOURCES.filter((s) => brief.urls[s.key] && !s.covers.some((c) => have.has(c))).map((s) => s.source);
}

export function selectedPersonas(brief: InputBrief, personas: AudiencePersona[]): AudiencePersona[] {
  const ids = new Set(brief.targetAudience.personaIds);
  return personas.filter((p) => ids.has(p.id));
}

const KPIS: Record<Objective, string[]> = {
  awareness: ['views', 'reach', 'engagement'],
  launch: ['views', 'reach', 'engagement', 'followers'],
  conversion: ['clicks', 'orders', 'cpv'],
  tiktok_shop: ['orders', 'gmv', 'clicks'],
  brand_building: ['engagement', 'followers', 'views'],
  ugc: ['content_pieces', 'engagement'],
};

const FORMATS: Record<Objective, string[]> = {
  awareness: ['in_feed', 'series'],
  launch: ['in_feed', 'series'],
  conversion: ['in_feed', 'affiliate'],
  tiktok_shop: ['live', 'affiliate', 'in_feed'],
  brand_building: ['series', 'in_feed'],
  ugc: ['in_feed'],
};

const PERSUASION_CRITERION: Record<Objective, { th: string; en: string }> = {
  awareness: { th: 'เล่าเรื่องสนุก เข้าถึงคนจำนวนมาก และเป็นกันเอง', en: 'Entertaining storytelling with broad reach' },
  launch: { th: 'แนะนำสินค้าใหม่ได้ชัดเจนและสร้างความอยากลอง', en: 'Introduces new products clearly and creates curiosity' },
  conversion: { th: 'รีวิวสินค้าได้ชัดเจน มีการชวนซื้อผ่านลิงก์', en: 'Clear product reviews with a call to buy via link' },
  tiktok_shop: { th: 'ขายของผ่านตะกร้าหรือไลฟ์ได้เป็นธรรมชาติ', en: 'Sells naturally through TikTok Shop baskets or live' },
  brand_building: { th: 'โทนเนื้อหาสม่ำเสมอและสอดคล้องกับภาพลักษณ์แบรนด์', en: 'Consistent tone that fits the brand image' },
  ugc: { th: 'ผลิตคลิปคุณภาพดีที่แบรนด์นำไปใช้ต่อได้', en: 'Produces good-quality clips the brand can reuse' },
};

/** Text the category heuristic reads: everything the user and the evidence cards said. */
export function brandSignalTexts(brief: InputBrief, evidence: EvidenceCard[]): string[] {
  return [
    brief.company.name,
    ...brief.company.aliases,
    brief.targetAudience.freeText ?? '',
    brief.voiceTranscript ?? '',
    ...brief.imageFindings.flatMap((f) => f.facts),
    ...evidence.flatMap((e) => [...e.products.map((p) => p.name), ...e.usp, ...e.audienceCues, ...e.claims.map((c) => c.text)]),
  ].filter(Boolean);
}

function genericSegment(label: string): BrandProfile['audience']['segments'][number] {
  return {
    label,
    ageDist: { '18-24': 0.35, '25-34': 0.45, '35-44': 0.2 },
    genderDist: { female: 0.5, male: 0.5 },
    regionDist: {},
    interests: [],
    painPoints: [],
    purchaseDrivers: [],
  };
}

/** Deterministic BrandProfile from the brief, evidence cards, personas and a keyword category guess. */
export function buildStubBrandProfile(a: ResearchBrandArgs): BrandProfile {
  const { brief, evidence } = a;
  const personas = selectedPersonas(brief, a.personas);
  const category = guessCategory(brandSignalTexts(brief, evidence), a.categories, personas);
  const parentId = category.parentId;
  const objective = brief.campaign.objective;
  const regulated = regulatedFor(category.id);

  const products = uniqText(evidence.flatMap((e) => e.products.map((p) => p.name)))
    .slice(0, 8)
    .map((name) => {
      const prices = evidence.flatMap((e) => e.products.filter((p) => p.name.trim() === name && p.priceTHB != null).map((p) => p.priceTHB as number));
      return {
        name,
        categoryId: category.id,
        priceBandTHB: prices.length ? ([Math.min(...prices), Math.max(...prices)] as [number, number]) : null,
        keyBenefits: [],
        usp: null,
      };
    });

  const tiers = evidence.map((e) => e.priceTier).filter((t): t is 'mass' | 'masstige' | 'premium' | 'luxury' => t !== 'unknown');
  const pricePositioning = tiers.length
    ? ([...tiers].sort((x, y) => tiers.filter((t) => t === y).length - tiers.filter((t) => t === x).length)[0] ?? 'mass')
    : 'mass';

  const segments: BrandProfile['audience']['segments'] = personas.map((p) => ({
    label: p.labelTh,
    ageDist: p.ageDist,
    genderDist: p.genderDist,
    regionDist: p.regionDist ?? {},
    interests: p.interests,
    painPoints: [],
    purchaseDrivers: [],
  }));
  if (segments.length === 0) {
    segments.push(genericSegment(brief.targetAudience.freeText ? truncate(brief.targetAudience.freeText, 80) : 'กลุ่มเป้าหมายทั่วไป (ยังไม่ได้ระบุ)'));
  }
  const audienceSource: BrandProfile['audience']['source'] = personas.length ? (brief.targetAudience.freeText ? 'mixed' : 'user_selected') : 'inferred';

  const interests = uniqText(personas.flatMap((p) => p.interests));
  const catKeywords = categoryKeywords(category.id);
  const thaiKeywords = catKeywords.filter((k) => /[฀-๿]/.test(k));
  const enKeywords = catKeywords.filter((k) => !/[฀-๿]/.test(k));
  const keywordsTh = uniqText([`รีวิว${category.labelTh}`, category.labelTh, ...thaiKeywords.slice(0, 4)]).slice(0, 8);
  const keywordsEn = uniqText([category.labelEn.toLowerCase(), `${category.labelEn.toLowerCase()} review`, ...enKeywords.slice(0, 2), ...interests.slice(0, 2)]).slice(0, 6);
  const seedHashtags = uniqText([`รีวิว${category.labelTh}`, ...[...thaiKeywords, ...enKeywords].slice(0, 3)].map((k) => k.replace(/\s+/g, ''))).slice(0, 6);

  const personaLabels = personas.map((p) => p.labelTh).join(', ');
  const persuasion = PERSUASION_CRITERION[objective];
  const criteria = [
    { id: 'c1', textTh: `ทำคอนเทนต์หมวด${category.labelTh}อย่างสม่ำเสมอ`, textEn: `Creates ${category.labelEn} content regularly`, weight: 0.45 },
    {
      id: 'c2',
      textTh: personaLabels ? `ผู้ชมตรงกับกลุ่ม ${personaLabels}` : 'ผู้ชมส่วนใหญ่เป็นคนไทยและตรงกับกลุ่มลูกค้าของแบรนด์',
      textEn: personas.length ? `Audience matches ${personas.map((p) => p.labelEn).join(', ')}` : "Mostly Thai audience that matches the brand's customers",
      weight: 0.35,
    },
    { id: 'c3', textTh: persuasion.th, textEn: persuasion.en, weight: 0.2 },
  ];

  const evidenceRefs = evidence
    .map((card, i) => ({ card, ref: evidenceRef(i) }))
    .filter(({ card }) => card.sourceUrl)
    .map(({ card, ref }) => ({
      ref,
      claim: truncate(card.claims[0]?.text ?? card.usp[0] ?? `ข้อมูลจากแหล่ง ${card.source}`, 200),
      url: card.sourceUrl as string,
      retrievedAt: new Date().toISOString(),
    }));

  const followers = followerRangeForTiers(brief.campaign.preferredTiers);
  const tone = uniqText(evidence.flatMap((e) => e.tone)).slice(0, 5);

  const profile: BrandProfile = {
    schemaVersion: '1.0',
    brand: {
      name: brief.company.name,
      website: brief.urls.website,
      facebookUrl: brief.urls.facebook,
      tiktokHandle: tiktokHandleFromUrl(brief.urls.tiktok),
      industryId: category.id,
      subCategories: [],
      products,
      pricePositioning,
      personality: { toneKeywords: tone.length ? tone : ['เป็นกันเอง'], formality: 0.4, humor: 0.5, energy: 0.6 },
      languageStyle: { primary: 'th', englishMix: false, register: 'casual' },
      contentPillars: [category.labelTh],
      visualStyle: [],
      regulatedCategory: regulated,
    },
    audience: { segments, source: audienceSource, confidence: personas.length ? 0.6 : 0.3 },
    contentStyle: { formats: ['short_video'], hooks: [], themes: [category.labelTh], fbEngagement: { medianER: null, postsPerWeek: null } },
    campaign: {
      objective,
      kpis: KPIS[objective],
      budgetTHB: brief.campaign.budgetTHB,
      nCreators: brief.campaign.nCreators,
      preferredTiers: brief.campaign.preferredTiers,
      formats: FORMATS[objective],
    },
    creatorRequirements: {
      mustCategories: [category.id],
      niceCategories: parentId && a.categories.some((c) => c.id === parentId) ? [parentId] : [],
      desiredTone: ['เป็นกันเอง', 'จริงใจ'],
      personaArchetypes: [`ครีเอเตอร์สาย${category.labelTh}`],
      followers,
      minMedianViews: null,
      languages: ['th'],
      dialects: [],
      excludeKeywords: [],
      excludeHandles: brief.constraints.excludeHandles,
      competitorBrands: brief.constraints.competitors,
      exclusivityWindowDays: 90,
      brandSafetyLevel: regulated !== 'none' ? 'strict' : 'standard',
      allowMinors: false,
    },
    matchingQueries: { criteria, seedHashtags, keywordsTh, keywordsEn },
    scoringPreset: objective,
    evidence: evidenceRefs,
    sourcesUnavailable: unavailableSources(brief, evidence),
    unknowns: [
      'ยังไม่ได้วิเคราะห์แบรนด์ด้วย AI (โหมดเดโม) หมวดสินค้าเดาจากคำสำคัญในข้อมูลที่กรอกเท่านั้น',
      ...(products.length ? [] : ['ยังไม่ทราบรายการสินค้าของแบรนด์']),
    ],
    confidence: Math.round(clamp(0.25 + 0.05 * evidence.length + (personas.length ? 0.1 : 0), 0, 0.6) * 100) / 100,
  };
  return BrandProfile.parse(profile);
}
