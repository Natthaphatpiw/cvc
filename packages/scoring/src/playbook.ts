import type {
  CollaborationModel,
  ContentFormat,
  CreatorDossier,
  CreatorMetrics,
  CreatorRole,
  Objective,
  Playbook,
  RankedCreator,
  Tier,
} from '@cvc/schemas';
import { THAI_WEEKDAYS } from './text';

export type PlaybookHints = Pick<Playbook, 'role' | 'recommendedFormats' | 'collaborationModel' | 'postingWindow'>;

export const ROLE_LABEL_TH: Record<CreatorRole, string> = {
  hero_awareness: 'สร้างการรับรู้ในวงกว้าง',
  conversion_driver: 'กระตุ้นยอดขาย',
  community_trust: 'สร้างความน่าเชื่อถือในกลุ่มผู้ติดตาม',
  ugc_content: 'ผลิตคอนเทนต์แบบ UGC',
  live_seller: 'ไลฟ์ขายสินค้า',
};

export const FORMAT_LABEL_TH: Record<ContentFormat, string> = {
  in_feed: 'คลิปในฟีด',
  live: 'ไลฟ์',
  affiliate: 'affiliate (ค่าคอมมิชชัน)',
  series: 'คลิปซีรีส์',
  duet_stitch: 'Duet/Stitch',
  spark_ads: 'Spark Ads',
};

const MID_PLUS: readonly Tier[] = ['mid', 'macro', 'mega'];
const SMALL: readonly Tier[] = ['nano', 'micro'];

function shopSignals(d: CreatorDossier): { strong: boolean; any: boolean } {
  const shopVideos = d.videos.filter((v) => v.hasShopProduct === true).length;
  const share = d.videos.length > 0 ? shopVideos / d.videos.length : 0;
  const strong = d.profile.isShopSeller === true || share >= 0.3;
  return { strong, any: strong || d.profile.isCommerceUser === true || shopVideos > 0 };
}

function roleFor(d: CreatorDossier, r: RankedCreator, objective: Objective): CreatorRole {
  const shop = shopSignals(d);
  const tier = d.tier;
  const midPlus = tier !== null && MID_PLUS.includes(tier);
  const reach = r.sub.performance.reach ?? 0;
  const er = r.sub.performance.er ?? 0;
  const credible = (r.sub.trust.authenticity ?? 0) >= 0.8 && (r.sub.fit.style ?? 0) >= 0.6;
  const selling = objective === 'conversion' || objective === 'tiktok_shop';

  if (objective === 'tiktok_shop' && shop.strong) return 'live_seller';
  if (selling && shop.any) return 'conversion_driver';
  if (objective === 'ugc' || tier === 'nano') return 'ugc_content';
  if ((objective === 'awareness' || objective === 'launch') && midPlus && reach >= 0.6) return 'hero_awareness';
  if (er >= 0.6 && credible) return 'community_trust';
  if (selling) return 'conversion_driver';
  if (objective === 'awareness' || objective === 'launch') return midPlus ? 'hero_awareness' : 'community_trust';
  return 'community_trust';
}

function formatsFor(role: CreatorRole, objective: Objective, shopAny: boolean): ContentFormat[] {
  switch (role) {
    case 'live_seller':
      return ['live', 'affiliate', 'in_feed'];
    case 'conversion_driver':
      return objective === 'tiktok_shop' || shopAny ? ['in_feed', 'affiliate', 'spark_ads'] : ['in_feed', 'spark_ads'];
    case 'hero_awareness':
      return objective === 'launch' ? ['in_feed', 'spark_ads', 'series'] : ['in_feed', 'spark_ads', 'duet_stitch'];
    case 'community_trust':
      return ['series', 'in_feed', 'duet_stitch'];
    case 'ugc_content':
      return ['in_feed', 'spark_ads'];
  }
}

function collaborationFor(objective: Objective, tier: Tier | null, shopAny: boolean): CollaborationModel {
  const small = tier !== null && SMALL.includes(tier);
  if (objective === 'conversion' || objective === 'tiktok_shop') return small && shopAny ? 'affiliate_commission' : 'hybrid';
  if (objective === 'ugc') return tier === 'nano' ? 'gifting' : 'fixed_fee';
  return 'fixed_fee';
}

/** Best days / hours (Asia/Bangkok) from the metrics; null when there were too few dated clips (< 6). */
export function postingWindow(metrics: CreatorMetrics): Playbook['postingWindow'] {
  if (metrics.videosAnalyzed < 6) return null;
  if (metrics.bestDays.length === 0 && metrics.bestHours.length === 0) return null;
  return {
    bestDays: [...metrics.bestDays],
    bestHours: [...metrics.bestHours],
    basisTh: `อิงจากยอดวิวมัธยฐานของ ${metrics.videosAnalyzed} คลิปล่าสุด แยกตามวันและชั่วโมงที่โพสต์ (เวลาประเทศไทย) นับเฉพาะช่วงที่มีอย่างน้อย 2 คลิป`,
  };
}

/** Deterministic role / formats / collaboration model / posting window; LLM4 writes the Thai narrative around them. */
export function playbookHints(args: { dossier: CreatorDossier; ranked: RankedCreator; objective: Objective }): PlaybookHints {
  const { dossier, ranked, objective } = args;
  const shop = shopSignals(dossier);
  const role = roleFor(dossier, ranked, objective);
  return {
    role,
    recommendedFormats: formatsFor(role, objective, shop.any),
    collaborationModel: collaborationFor(objective, dossier.tier, shop.any),
    postingWindow: postingWindow(dossier.metrics),
  };
}

/** 'วันพุธ, วันศุกร์ ช่วง 19:00–20:00 น., 21:00–22:00 น.' */
/** [18, 19, 20, 22] → ['18:00–21:00 น.', '22:00–23:00 น.'] (contiguous hours merged, 23→0 wraps). */
export function hourRangesTh(hours: readonly number[]): string[] {
  const sorted = [...new Set(hours)].filter((h) => Number.isInteger(h) && h >= 0 && h <= 23).sort((a, b) => a - b);
  const runs: { start: number; end: number }[] = [];
  for (const h of sorted) {
    const last = runs[runs.length - 1];
    if (last && h === last.end) last.end = h + 1;
    else runs.push({ start: h, end: h + 1 });
  }
  const first = runs[0];
  const last = runs[runs.length - 1];
  if (runs.length > 1 && first && last && first.start === 0 && last.end === 24) {
    runs.shift();
    last.end = 24 + first.end;
  }
  const hh = (n: number) => `${String(n % 24).padStart(2, '0')}:00`;
  return runs.map((r) => `${hh(r.start)}–${hh(r.end)} น.`);
}

export function describePostingWindowTh(w: NonNullable<Playbook['postingWindow']>): string {
  const days = w.bestDays.map((d) => `วัน${THAI_WEEKDAYS[d] ?? ''}`).join(', ');
  const hours = hourRangesTh(w.bestHours).join(', ');
  if (days && hours) return `${days} ช่วง ${hours}`;
  return days || `ช่วง ${hours}`;
}
