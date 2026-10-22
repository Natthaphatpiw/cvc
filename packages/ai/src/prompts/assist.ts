import { PROMPT_VERSION, type AssistRequest, type AudiencePersona } from '@cvc/schemas';
import { OBJECTIVE_LABEL_TH } from '../format';
import { OBJECTIVE_CUES, THB_BUDGET_RULES } from './normalize';
import { SPOTLIGHT_RULES, spotlight } from './spotlight';

export const ASSIST_PROMPT_VERSION = `assist-${PROMPT_VERSION}`;

const OBJECTIVE_GLOSSARY = Object.entries(OBJECTIVE_LABEL_TH)
  .map(([id, th]) => `${id}=${th}`)
  .join(', ');

const ROLE = `You are the form assistant of a TikTok creator (KOL) matching tool for the Thai market, used by agency planners at Convert Cake. In the new-analysis form the planner typed a short need about the client brand in Thai (for example what the brand sells and to whom). You fill one section of the form from that need; the planner reviews and edits your answer before submitting it.`;

const COMMON_RULES = `- Base the answer on the need. The company name and URLs are context only: never present your own knowledge about the company, its products or any real brand or person as fact.
- noteTh: one short Thai sentence that tells the planner what you filled and why, so they can check it.
- Thai for every text field. No emoji.`;

export const ASSIST_AUDIENCE_INSTRUCTIONS = `${ROLE} This time you fill the "target audience" section.

Rules:
- personaIds: 1-4 ids copied exactly from the persona catalog, best match first: the personas most likely to buy what the need describes. Prefer the most specific personas whose daily life fits the product and the moment it is used (a quick breakfast fits busy working people); add an age-based persona (such as the 50+ group) only when the need names that age or the product is clearly made for it. Never invent or change an id. Return an empty list only when no persona in the catalog fits at all.
- audienceNotes: 2-3 short Thai sentences on the target customers: who they are, one focused age range, what they need and how they decide to buy. Keep it to what the need implies; do not invent statistics.
- Do not infer or target religion, ethnicity, sexual orientation or health conditions of people.
${COMMON_RULES}

${SPOTLIGHT_RULES}`;

export const ASSIST_CAMPAIGN_INSTRUCTIONS = `${ROLE} This time you fill the "campaign" section.

Rules:
- objective: exactly one id. Thai cues: ${OBJECTIVE_CUES}. Thai labels the planner sees: ${OBJECTIVE_GLOSSARY}. When the need names no goal, pick the one that fits the product and the need best.
- budgetMinTHB and budgetMaxTHB: only when the need states an amount of money; otherwise both null. Never guess a budget. ${THB_BUDGET_RULES} A range ("1-2 แสน") gives min and max; "ราว", "ประมาณ" or "ไม่เกิน" with one amount is a single amount.
- nCreators: the number of creators the need asks for (1-10). When it does not say, 3-5 (5 for a first campaign).
${COMMON_RULES}

${SPOTLIGHT_RULES}`;

export function assistInstructions(section: AssistRequest['section']): string {
  return section === 'audience' ? ASSIST_AUDIENCE_INSTRUCTIONS : ASSIST_CAMPAIGN_INSTRUCTIONS;
}

/** Dynamic part: the form context and the need (both typed by the user, so spotlighted), plus the persona catalog. */
export function buildAssistUserContent(req: AssistRequest, personas: AudiencePersona[]): string {
  const field = (id: string, value: string | null) => (value ? spotlight(id, 'form_field', value) : 'not given');
  const lines = [
    `Company name (from the form): ${field('company', req.companyName)}`,
    `Website (from the form): ${field('website', req.websiteUrl)}`,
    `Facebook page (from the form): ${field('facebook', req.facebookUrl)}`,
  ];
  if (req.section === 'audience') {
    const catalog = personas.map((p) => ({
      id: p.id,
      labelTh: p.labelTh,
      labelEn: p.labelEn,
      descriptionTh: p.descriptionTh,
      ageDist: p.ageDist,
      interests: p.interests,
      categoryHints: p.categoryHints,
    }));
    lines.push(`Persona catalog (reference data, choose ids from here only):\n${catalog.length ? JSON.stringify(catalog) : 'empty (return no ids)'}`);
  }
  lines.push(`Need typed by the planner: ${spotlight('need', 'user_need', req.promptTh)}`);
  return lines.join('\n\n');
}
