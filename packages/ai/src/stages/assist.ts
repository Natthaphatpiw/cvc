import {
  AudienceAssistResponse,
  CampaignAssistResponse,
  type AssistRequest,
  type AssistResponse,
  type AudiencePersona,
} from '@cvc/schemas';
import { shouldStub } from '../env';
import { LlmAudienceAssist, LlmCampaignAssist } from '../llm-schemas';
import { assistInstructions, buildAssistUserContent } from '../prompts/assist';
import { generateStructured } from '../structured';
import { ASSIST_MAX_PERSONAS, budgetRange, buildStubAssist, moneyMentioned, parseBudgetTh } from '../stubs/assist';
import { clamp, truncate, uniqText } from '../text';
import type { AiCtx } from '../types';

/** The planner is waiting on the form: a short answer, and room for low-effort reasoning. */
const ASSIST_MAX_OUTPUT_TOKENS = 1_200;
const NOTE_MAX_CHARS = 300;
const NOTE_FALLBACK_TH = 'กรอกให้แล้ว ตรวจสอบและแก้ไขได้ก่อนส่ง';

const note = (text: string): string => truncate(text, NOTE_MAX_CHARS) || NOTE_FALLBACK_TH;

/** Issues the repair turn should fix: persona ids that are not in the catalog, and empty notes. */
export function audienceAssistIssues(v: AudienceAssistResponse, known: ReadonlySet<string>): string[] {
  const issues: string[] = [];
  const bad = v.audience.personaIds.filter((id) => !known.has(id));
  if (bad.length) issues.push(`personaIds: ${bad.join(', ')} are not ids from the persona catalog`);
  if (!v.audience.audienceNotes) issues.push('audienceNotes: write 2-3 Thai sentences about the target customers');
  return issues;
}

/** Keeps catalog ids only (at most 4): the form can only show personas it knows. */
export function sanitizeAudienceAssist(v: AudienceAssistResponse, known: ReadonlySet<string>): AudienceAssistResponse {
  return AudienceAssistResponse.parse({
    ...v,
    audience: { ...v.audience, personaIds: v.audience.personaIds.filter((id) => known.has(id)).slice(0, ASSIST_MAX_PERSONAS) },
  });
}

/**
 * Form assist: fills the audience or campaign section of the new-analysis form from a short Thai need. Fast tier, low
 * effort, one strict schema per section. The caller passes a short ctx.signal: the planner is waiting.
 */
export async function assistForm(req: AssistRequest, personas: AudiencePersona[], ctx?: AiCtx): Promise<AssistResponse> {
  if (shouldStub('assistForm')) return buildStubAssist(req, personas);
  const userContent = buildAssistUserContent(req, personas);

  if (req.section === 'audience') {
    const known = new Set(personas.map((p) => p.id));
    const { value } = await generateStructured({
      stage: 'assist_audience',
      tier: 'fast',
      effort: 'low',
      instructions: assistInstructions('audience'),
      userContent,
      llmSchema: LlmAudienceAssist,
      toDomain: (raw): AudienceAssistResponse => ({
        section: 'audience',
        audience: { personaIds: uniqText(raw.personaIds).slice(0, 10), audienceNotes: truncate(raw.audienceNotes, 2_000) },
        noteTh: note(raw.noteTh),
      }),
      domainSchema: AudienceAssistResponse,
      check: (v) => audienceAssistIssues(v, known),
      maxOutputTokens: ASSIST_MAX_OUTPUT_TOKENS,
      ctx,
    });
    return sanitizeAudienceAssist(value, known);
  }

  // A budget only when the planner mentioned money; a model miss on a stated amount falls back to the parser.
  const money = moneyMentioned(req.promptTh);
  const { value } = await generateStructured({
    stage: 'assist_campaign',
    tier: 'fast',
    effort: 'low',
    instructions: assistInstructions('campaign'),
    userContent,
    llmSchema: LlmCampaignAssist,
    toDomain: (raw): CampaignAssistResponse => ({
      section: 'campaign',
      campaign: {
        objective: raw.objective,
        budgetTHB: money ? (budgetRange(raw.budgetMinTHB, raw.budgetMaxTHB) ?? parseBudgetTh(req.promptTh)) : null,
        nCreators: Math.round(clamp(raw.nCreators, 1, 10)),
      },
      noteTh: note(raw.noteTh),
    }),
    domainSchema: CampaignAssistResponse,
    maxOutputTokens: ASSIST_MAX_OUTPUT_TOKENS,
    ctx,
  });
  return value;
}
