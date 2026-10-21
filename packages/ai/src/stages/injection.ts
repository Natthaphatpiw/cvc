import type { CreatorDossier } from '@cvc/schemas';
import { shouldStub } from '../env';
import { LlmInjectionScreen } from '../llm-schemas';
import { buildInjectionUserContent, INJECTION_INSTRUCTIONS } from '../prompts/injection';
import { generateStructured } from '../structured';
import { truncate } from '../text';
import type { AiCtx } from '../types';

export type InjectionScreen = { suspected: boolean; reason: string | null };

/** Phrases that address an AI/evaluator directly. Matching is case-insensitive on NFC text. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any )?(the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i,
  /disregard (all |any )?(the )?(previous|prior|above) (instructions|rules)/i,
  /\b(system|developer) (prompt|message|instruction)/i,
  /\byou are now\b/i,
  /\b(ai|llm|language model|assistant|evaluator)s?\b[^.\n]{0,30}\b(must|should) (rank|score|rate|recommend) (me|this)/i,
  /\b(rank|score|rate) (me|this (creator|account|profile)) (as )?(the )?(highest|top|first|10\/10|100)/i,
  /<\/?(system|assistant|instructions?)>/i,
  /^\s*(system|assistant)\s*:/im,
  /เพิกเฉย(ต่อ)?คำสั่ง/,
  /ลืมคำสั่ง(ก่อนหน้า|เดิม)/,
  /(ai|เอไอ|ระบบ|โมเดล)[^\n]{0,30}(ให้คะแนน|จัดอันดับ)[^\n]{0,20}(สูงสุด|อันดับ\s*1|เต็ม)/i,
];

/** Cheap deterministic screen over display name, bio and captions. */
export function heuristicInjectionScreen(d: CreatorDossier): InjectionScreen {
  const texts = [d.profile.displayName ?? '', d.profile.bio ?? '', ...d.videos.map((v) => v.caption ?? '')];
  for (const raw of texts) {
    const t = raw.normalize('NFC');
    for (const re of INJECTION_PATTERNS) {
      const m = re.exec(t);
      if (m) return { suspected: true, reason: `Instruction-like text found: "${truncate(m[0], 80)}"` };
    }
  }
  return { suspected: false, reason: null };
}

/** Injection screen before LLM2b: heuristic first, then the fast model (no tools) when the heuristic is clean. */
export async function screenInjection(d: CreatorDossier, ctx?: AiCtx): Promise<InjectionScreen> {
  const heuristic = heuristicInjectionScreen(d);
  if (heuristic.suspected || shouldStub('screenInjection')) return heuristic;
  const hasText = Boolean(d.profile.bio?.trim() || d.profile.displayName?.trim() || d.videos.some((v) => v.caption?.trim()));
  if (!hasText) return heuristic;

  const { value } = await generateStructured({
    stage: 'injection_screen',
    tier: 'fast',
    effort: 'low',
    instructions: INJECTION_INSTRUCTIONS,
    userContent: buildInjectionUserContent(d),
    llmSchema: LlmInjectionScreen,
    toDomain: (raw): InjectionScreen => ({ suspected: raw.suspected, reason: raw.suspected ? truncate(raw.reason ?? 'flagged by classifier', 300) : null }),
    domainSchema: LlmInjectionScreen,
    maxOutputTokens: 1_000,
    ctx,
  });
  return value;
}
