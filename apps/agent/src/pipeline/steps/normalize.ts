import { normalizeInput } from '@cvc/ai';
import { isPrivateBlobConfigured, readPrivateBlob } from '@cvc/media';
import type { InputBrief, RunInput } from '@cvc/schemas';
import { errorMessage } from '../../lib/async';
import {
  MSG,
  addWarnings,
  briefFromInput,
  createAiCtx,
  demoPause,
  emitProgress,
  getCheckpoint,
  guardBudget,
  loadActiveRun,
  putCheckpoint,
  store,
} from '../context';
import { StepKey, type NormalizeCheckpoint, type SourceKind } from '../types';

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type BriefImage = { url: string; mediaType: string; pathname: string };

/** Screenshots for LLM0 vision, read from the private Blob store and passed inline as data URLs. */
async function loadImages(input: RunInput, warnings: string[]): Promise<BriefImage[]> {
  const assets = input.assets.filter((a) => a.kind === 'screenshot' || a.kind === 'image').slice(0, MAX_IMAGES);
  if (assets.length === 0) return [];
  if (!isPrivateBlobConfigured()) {
    warnings.push('ยังไม่ได้ตั้งค่าที่เก็บไฟล์ จึงข้ามการอ่านรูปภาพที่แนบมา');
    return [];
  }
  const images: BriefImage[] = [];
  for (const asset of assets) {
    try {
      const blob = await readPrivateBlob(asset.pathname);
      if (!blob || blob.data.byteLength > MAX_IMAGE_BYTES || !blob.contentType.startsWith('image/')) continue;
      const b64 = Buffer.from(blob.data).toString('base64');
      images.push({ url: `data:${blob.contentType};base64,${b64}`, mediaType: blob.contentType, pathname: asset.pathname });
    } catch (err) {
      console.warn('[agent] image read failed', asset.pathname, errorMessage(err));
    }
  }
  if (images.length < assets.length) warnings.push('อ่านรูปภาพที่แนบมาได้ไม่ครบ จึงวิเคราะห์จากข้อมูลส่วนที่เหลือ');
  return images;
}

function sourcesFor(brief: InputBrief, input: RunInput): SourceKind[] {
  const out: SourceKind[] = [];
  if (brief.urls.website ?? input.websiteUrl) out.push('website');
  if (brief.urls.facebook ?? input.facebookUrl) out.push('facebook');
  if (brief.urls.tiktok ?? input.tiktokUrl) out.push('tiktok');
  return out;
}

/** LLM0: RunInput (+ screenshots, voice transcripts, personas) → InputBrief on runs.normalized_input. */
export async function normalizeStep(runId: string): Promise<NormalizeCheckpoint> {
  const done = await getCheckpoint<NormalizeCheckpoint>(runId, StepKey.normalize);
  if (done) return done;

  const run = await loadActiveRun(runId);
  const started = Date.now();
  await emitProgress(runId, { stage: 'normalize', status: 'started', pct: 3, messageTh: 'กำลังอ่านข้อมูลที่คุณกรอกและไฟล์ที่แนบมา' });
  await demoPause(run);

  const warnings: string[] = [];
  const personas = await store().listPersonas(run.input.personaIds);
  const ledger = createAiCtx(runId);
  let brief: InputBrief;
  const state = await guardBudget(runId);
  if (state === 'hard') {
    brief = briefFromInput(run.input);
  } else {
    try {
      const images = await loadImages(run.input, warnings);
      brief = await normalizeInput(run.input, { images, personas }, ledger.ctx);
    } catch (err) {
      console.warn('[agent] normalizeInput failed, using the form fields as-is', errorMessage(err));
      warnings.push('สรุปข้อมูลจากรูปภาพหรือเสียงไม่สำเร็จ จึงใช้ข้อมูลจากแบบฟอร์มโดยตรง');
      brief = briefFromInput(run.input);
    }
  }

  const sources = sourcesFor(brief, run.input);
  if (sources.length === 0) warnings.push(MSG.noUrls);

  await store().updateRun(runId, { normalizedInput: brief });
  await addWarnings(runId, warnings);
  const out: NormalizeCheckpoint = { sources };
  await putCheckpoint(runId, StepKey.normalize, out, {
    costUsd: ledger.spentUsd(),
    latencyMs: Date.now() - started,
    model: ledger.model(),
  });
  await emitProgress(runId, {
    stage: 'normalize',
    status: 'completed',
    pct: 8,
    messageTh: sources.length > 0 ? `พบแหล่งข้อมูลของแบรนด์ ${sources.length} แหล่ง` : 'ไม่มีลิงก์ของแบรนด์ จะวิเคราะห์จากชื่อและข้อมูลที่กรอก',
    partial: warnings.length > 0 ? { warnings } : undefined,
  });
  return out;
}
