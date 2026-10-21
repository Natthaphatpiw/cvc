import { PIPELINE_VERSION, type RunInput } from '@cvc/schemas';
import { canonicalJson, sha256Hex } from './util';

const text = (s: string | null | undefined): string => (s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
const lower = (s: string | null | undefined): string => text(s).toLowerCase();
const set = (xs: readonly string[] | undefined, f: (s: string) => string): string[] =>
  [...new Set((xs ?? []).map(f).filter((s) => s.length > 0))].sort();

function url(u: string | null | undefined): string | null {
  const raw = text(u);
  if (!raw) return null;
  try {
    const x = new URL(raw);
    x.hash = '';
    return x.toString().replace(/\/+$/, '');
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * sha256 of the canonical semantic content of a run input (plus PIPELINE_VERSION, so a pipeline change never dedupes
 * onto an older result). options, channel and noticeVersion do not change what the run computes and are ignored.
 */
export async function inputHash(input: RunInput): Promise<string> {
  const campaign = input.campaign;
  const semantic = {
    pipelineVersion: PIPELINE_VERSION,
    companyName: lower(input.companyName),
    urls: {
      website: url(input.websiteUrl),
      facebook: url(input.facebookUrl),
      tiktok: url(input.tiktokUrl),
      youtube: url(input.youtubeUrl),
      instagram: url(input.instagramUrl),
    },
    personaIds: set(input.personaIds, text),
    audienceNotes: text(input.audienceNotes) || null,
    assets: set(
      (input.assets ?? []).map((a) => a.pathname),
      text,
    ),
    voice: (input.voiceTranscripts ?? []).map((v) => text(v.text)),
    campaign: {
      objective: campaign?.objective ?? null,
      budgetTHB: campaign?.budgetTHB ?? null,
      nCreators: campaign?.nCreators ?? null,
      preferredTiers: set(campaign?.preferredTiers, text),
    },
    exclusions: {
      competitors: set(input.exclusions?.competitors, lower),
      handles: set(input.exclusions?.handles, (h) => lower(h).replace(/^@+/, '')),
    },
  };
  return sha256Hex(canonicalJson(semantic));
}
