import type { FinalResult, Recommendation } from '@cvc/schemas';
import { createUIMessageStream, createUIMessageStreamResponse, generateId, type UIMessage } from 'ai';
import { CONFIDENCE_TH, fmtCpv, fmtNumber, fmtPct, fmtTHBRange } from '../format';
import { normalizeHandle } from '../text';

export const DEMO_REPLY_PREFIX = 'นี่เป็นคำตอบตัวอย่างจากโหมดเดโม เพราะระบบยังไม่ได้ตั้งค่า OpenAI API key จึงตอบได้เฉพาะจากตัวเลขในผลลัพธ์นี้';

/** Plain text of the last user message. */
export function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  return last.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim();
}

/** Creators the question names (by @handle or bare handle), in result order. */
export function mentionedCreators(question: string, recs: Recommendation[]): Recommendation[] {
  const q = question.normalize('NFC').toLowerCase();
  return recs.filter((r) => {
    const h = normalizeHandle(r.handle);
    return h.length >= 2 && (q.includes(`@${h}`) || new RegExp(`(^|[^a-z0-9._])${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9._]|$)`).test(q));
  });
}

function creatorLine(r: Recommendation): string {
  const k = r.expectedKpis;
  return [
    `@${r.handle}: อันดับ ${r.rank} คะแนนรวม ${fmtNumber(r.scores.total)}`,
    `ยอดวิวคาดการณ์ต่อโพสต์ราว ${fmtNumber(k.perPost.views.p50)} วิว (ช่วง ${fmtNumber(k.perPost.views.p25)}–${fmtNumber(k.perPost.views.p75)}, ความมั่นใจ${CONFIDENCE_TH[k.confidence]})`,
    `ER ${fmtPct(r.erViews)}`,
    `ค่าจ้างประมาณ ${fmtTHBRange(r.estFeeTHB)}`,
    `ต้นทุนต่อวิว ${fmtCpv(r.estCPV)}`,
    `คะแนนความเหมาะสม (Fit) ${fmtNumber(r.scores.fit)}`,
  ].join(' · ');
}

function compareSentence(a: Recommendation, b: Recommendation): string {
  const parts: string[] = [];
  const va = a.expectedKpis.perPost.views.p50;
  const vb = b.expectedKpis.perPost.views.p50;
  if (va !== vb) parts.push(`@${va > vb ? a.handle : b.handle} มียอดวิวคาดการณ์สูงกว่า`);
  if (a.estCPV != null && b.estCPV != null && a.estCPV !== b.estCPV) parts.push(`@${a.estCPV < b.estCPV ? a.handle : b.handle} มีต้นทุนต่อวิวต่ำกว่า`);
  if (a.scores.fit !== b.scores.fit) parts.push(`@${a.scores.fit > b.scores.fit ? a.handle : b.handle} เข้ากับแบรนด์มากกว่าตามคะแนน Fit`);
  if (a.erViews != null && b.erViews != null && a.erViews !== b.erViews) parts.push(`@${a.erViews > b.erViews ? a.handle : b.handle} มี ER สูงกว่า`);
  return parts.length ? `สรุปจากตัวเลข: ${parts.join(' ส่วน ')}` : 'สรุปจากตัวเลข: ทั้งสองคนมีตัวเลขหลักใกล้เคียงกัน';
}

/** Deterministic demo answer built only from the result numbers. First sentence says it is a demo reply. */
export function buildStubAnswer(result: FinalResult, question: string): string {
  const recs = [...result.recommendations, ...result.addedFromChat];
  const lines = [DEMO_REPLY_PREFIX];
  if (recs.length === 0) {
    lines.push('ผลลัพธ์นี้ยังไม่มีครีเอเตอร์ที่แนะนำ จึงยังเปรียบเทียบตัวเลขไม่ได้');
  } else {
    const named = mentionedCreators(question, recs);
    const picked = named.length >= 2 ? named.slice(0, 2) : named.length === 1 ? named : recs.slice(0, Math.min(2, recs.length));
    const [a, b] = picked;
    if (a && b) {
      lines.push(`เปรียบเทียบ @${a.handle} กับ @${b.handle} (ยอดวิว ค่าจ้าง และต้นทุนต่อวิวเป็นค่าประมาณ):`);
      lines.push(`- ${creatorLine(a)}`, `- ${creatorLine(b)}`);
      lines.push(compareSentence(a, b));
    } else if (a) {
      lines.push(`ข้อมูลของ @${a.handle} (ยอดวิว ค่าจ้าง และต้นทุนต่อวิวเป็นค่าประมาณ):`, `- ${creatorLine(a)}`);
      if (a.risksTh.length) lines.push(`ข้อควรระวัง: ${a.risksTh.slice(0, 2).join(' / ')}`);
    }
  }
  lines.push('หากต้องการให้ผู้ช่วยตอบคำถามอื่นหรือวิเคราะห์เพิ่ม ต้องตั้งค่า OPENAI_API_KEY ก่อน');
  return lines.join('\n');
}

/** UI message stream (AI SDK 7, useChat-compatible) that streams the demo answer line by line. */
export function stubChatResponse(result: FinalResult, messages: UIMessage[]): Response {
  const answer = buildStubAnswer(result, lastUserText(messages));
  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: ({ writer }) => {
      const id = generateId();
      writer.write({ type: 'start', messageMetadata: { demo: true } });
      writer.write({ type: 'text-start', id });
      const lines = answer.split('\n');
      lines.forEach((line, i) => writer.write({ type: 'text-delta', id, delta: i < lines.length - 1 ? `${line}\n` : line }));
      writer.write({ type: 'text-end', id });
      writer.write({ type: 'finish', finishReason: 'stop' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
