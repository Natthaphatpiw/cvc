import type { BrandSafetyLevel, CandidateRef, Category, CreatorDossier, KolEvaluation, MinMax, SuitabilityTier } from '@cvc/schemas';
import { clamp01 } from './stats';
import { normalizeHandle, normalizeName, thaiShare } from './text';

/** Stable gate failure codes (shown in the UI as exclusion reasons). */
export const GATE_CODES = {
  notThai: 'not_thai',
  inactive30d: 'inactive_30d',
  followerRange: 'follower_range',
  blocklisted: 'blocklisted',
  excludedHandle: 'excluded_handle',
  minVideos90d: 'min_videos_90d',
  competitorExclusivity: 'competitor_exclusivity',
  feeOverBudget: 'fee_over_budget',
  suitabilityFloor: 'suitability_floor',
  possibleMinor: 'possible_minor',
  bcProhibited: 'bc_prohibited',
} as const;
export type GateCode = (typeof GATE_CODES)[keyof typeof GATE_CODES];

export type GateContext = {
  now: Date;
  /** max days since the last post (default 30; the agent passes 60 when gate 0a is relaxed) */
  activeDays?: number;
  followerRange: MinMax | null;
  excludeHandles: string[];
  blockedHandles: string[];
  competitors: string[];
  exclusivityWindowDays: number;
  budgetPerCreatorTHB: number | null;
  minVideos90d: number;
  brandSafetyLevel: BrandSafetyLevel;
  categoryPolicy: Record<string, Category['tiktokBcPolicy']>;
};

const DAY_MS = 86_400_000;
const DEFAULT_ACTIVE_DAYS = 30;

/** Suitability (GARM-style risk tier: low = safest) allowed per brand-safety level. */
export const SUITABILITY_ALLOWED: Record<BrandSafetyLevel, readonly SuitabilityTier[]> = {
  strict: ['low'],
  standard: ['low', 'medium'],
  relaxed: ['low', 'medium', 'high'],
};

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : (now.getTime() - t) / DAY_MS;
}

function outOfRange(followers: number | null, range: MinMax | null): boolean {
  if (!range || followers === null) return false;
  return followers < range.min || followers > range.max;
}

const isTH = (region: string | null | undefined): boolean => (region ?? '').trim().toUpperCase() === 'TH';

/** Gate 0a (profile-only, before enrich). Unknown values pass; enrich re-checks them in gate 0b. */
export function gate0a(c: CandidateRef, ctx: GateContext): string[] {
  const out: string[] = [];
  if (c.region !== null && c.region.trim() !== '' && !isTH(c.region)) out.push(GATE_CODES.notThai);
  const idle = daysSince(c.lastPostedAt, ctx.now);
  if (idle !== null && idle > (ctx.activeDays ?? DEFAULT_ACTIVE_DAYS)) out.push(GATE_CODES.inactive30d);
  if (outOfRange(c.followers, ctx.followerRange)) out.push(GATE_CODES.followerRange);
  const h = normalizeHandle(c.handle);
  if (ctx.blockedHandles.some((b) => normalizeHandle(b) === h)) out.push(GATE_CODES.blocklisted);
  if (ctx.excludeHandles.some((b) => normalizeHandle(b) === h)) out.push(GATE_CODES.excludedHandle);
  return out;
}

/** §5.3.4 Thai filter on the full dossier: region TH, or ≥ 60 % of videos created in TH, or mainly Thai text. */
function isThaiCreator(d: CreatorDossier): boolean | null {
  const signals: boolean[] = [];
  if (d.profile.region) signals.push(isTH(d.profile.region));
  const located = d.videos.filter((v) => v.locationCreated);
  if (located.length > 0) signals.push(located.filter((v) => isTH(v.locationCreated)).length / located.length >= 0.6);
  const text = [d.profile.bio ?? '', ...d.videos.map((v) => v.caption ?? '')].join(' ');
  if (/[\p{L}]/u.test(text)) signals.push(thaiShare(text) >= 0.5);
  if (signals.length === 0) return null;
  return signals.some(Boolean);
}

function mentionsCompetitor(text: string, competitors: readonly string[]): boolean {
  const t = normalizeName(text);
  const compact = t.replace(/\s/g, '');
  return competitors.some((c) => {
    const n = normalizeName(c);
    return n.length > 0 && (t.includes(n) || compact.includes(n.replace(/\s/g, '')));
  });
}

/** Gate 0b (after enrich, before LLM2b). `estFee` is the creator's estimated fee range. */
export function gate0b(d: CreatorDossier, estFee: MinMax, ctx: GateContext): string[] {
  const out: string[] = [];
  if (isThaiCreator(d) === false) out.push(GATE_CODES.notThai);

  const lastPosted = d.metrics.lastPostedAt ?? d.videos.map((v) => v.postedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const idle = daysSince(lastPosted, ctx.now);
  if (idle !== null && idle > (ctx.activeDays ?? DEFAULT_ACTIVE_DAYS)) out.push(GATE_CODES.inactive30d);

  if (outOfRange(d.profile.followerCount, ctx.followerRange)) out.push(GATE_CODES.followerRange);

  const recent = d.videos.filter((v) => {
    const age = daysSince(v.postedAt, ctx.now);
    return age !== null && age <= 90;
  }).length;
  if (recent < ctx.minVideos90d) out.push(GATE_CODES.minVideos90d);

  if (ctx.competitors.length > 0) {
    const within = (iso: string | null) => {
      const age = daysSince(iso, ctx.now);
      return age !== null && age <= ctx.exclusivityWindowDays;
    };
    const viaCollab = d.collabs.some((c) => within(c.detectedAt) && mentionsCompetitor(c.brandName, ctx.competitors));
    const viaPost = d.videos.some(
      (v) =>
        (v.isSponsored === true || v.isAd === true) &&
        within(v.postedAt) &&
        mentionsCompetitor(`${v.caption ?? ''} ${v.hashtags.join(' ')}`, ctx.competitors),
    );
    if (viaCollab || viaPost) out.push(GATE_CODES.competitorExclusivity);
  }

  if (ctx.budgetPerCreatorTHB !== null && estFee.max > 0 && estFee.min > ctx.budgetPerCreatorTHB) out.push(GATE_CODES.feeOverBudget);
  return out;
}

function policyFor(tag: string, policy: Record<string, Category['tiktokBcPolicy']>): Category['tiktokBcPolicy'] | null {
  const own = policy[tag];
  if (own) return own;
  const dot = tag.lastIndexOf('.');
  return dot > 0 ? (policy[tag.slice(0, dot)] ?? null) : null;
}

/** Gate 0c (after LLM2b). Restricted categories pass here; they need a human sign-off downstream. */
export function gate0c(e: KolEvaluation, ctx: GateContext): string[] {
  const out: string[] = [];
  if (!SUITABILITY_ALLOWED[ctx.brandSafetyLevel].includes(e.suitabilityTier)) out.push(GATE_CODES.suitabilityFloor);
  if (e.possibleMinor) out.push(GATE_CODES.possibleMinor);
  if (e.categoryTags.some((t) => policyFor(t, ctx.categoryPolicy) === 'prohibited')) out.push(GATE_CODES.bcProhibited);
  return out;
}

/** Restricted (needs sign-off) category tags of an evaluation — informational, not a gate failure. */
export function restrictedCategories(e: KolEvaluation, ctx: Pick<GateContext, 'categoryPolicy'>): string[] {
  return e.categoryTags.filter((t) => policyFor(t, ctx.categoryPolicy) === 'restricted');
}

/**
 * Cheap pre-enrich rank in [0,1] from typed discovery fields only. Follower count peaks around 100k (sponsored
 * engagement is inverted-U in follower count), plus catalogue depth and region certainty.
 */
export function preScore(c: CandidateRef): number {
  const followers = c.followers !== null && c.followers > 0 ? clamp01(1 - Math.abs(Math.log10(c.followers) - 5) / 3) : 0.3;
  const videos = c.videoCount !== null ? clamp01(Math.log10(c.videoCount + 1) / 2.5) : 0.3;
  const region = c.region === null ? 0.5 : isTH(c.region) ? 1 : 0;
  const active = c.lastPostedAt ? 1 : 0.5;
  return Math.round((0.55 * followers + 0.2 * videos + 0.15 * region + 0.1 * active) * 10_000) / 10_000;
}
