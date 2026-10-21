import { transcribe } from '@cvc/ai';
import { requireEdge, requireUser } from '@cvc/auth';
import { isPrivateBlobConfigured, readPrivateBlob } from '@cvc/media';
import { TranscribeRequest, type TranscribeResponse } from '@cvc/schemas';
import { Hono } from 'hono';
import { ApiFailure, currentUser, enforceRateLimit, readJson, validationFailure, type AppEnv } from '../http';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
/** 3 minutes plus a little slack for encoder padding. */
const MAX_AUDIO_SECONDS = 185;

export function transcribeRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/transcribe', requireEdge(), requireUser({ allowAnonymous: true }), async (c) => {
    const user = currentUser(c);
    const parsed = TranscribeRequest.safeParse(await readJson(c));
    if (!parsed.success) throw validationFailure(parsed.error.issues);
    const { assetPathname } = parsed.data;

    // IDOR guard: a user may only transcribe their own uploads.
    if (!assetPathname.startsWith(`uploads/${user.id}/`) || assetPathname.includes('..')) {
      throw new ApiFailure(403, 'asset_forbidden', 'ไม่สามารถใช้ไฟล์นี้ได้ เพราะไม่ใช่ไฟล์ที่คุณอัปโหลด');
    }
    await enforceRateLimit(`rl:transcribe:${user.id}`, 10, 3600);

    if (!isPrivateBlobConfigured()) {
      throw new ApiFailure(503, 'private_blob_not_configured', 'ระบบจัดเก็บไฟล์เสียงยังไม่ได้ตั้งค่า (โหมดสาธิต) กรุณาพิมพ์ข้อความแทน');
    }
    const blob = await readPrivateBlob(assetPathname);
    if (!blob) throw new ApiFailure(404, 'asset_not_found', 'ไม่พบไฟล์เสียงที่อัปโหลด กรุณาอัปโหลดใหม่');
    if (blob.data.byteLength > MAX_AUDIO_BYTES) {
      throw new ApiFailure(413, 'audio_too_large', 'ไฟล์เสียงมีขนาดเกิน 25 MB');
    }
    const contentType = blob.contentType || 'application/octet-stream';
    if (!contentType.startsWith('audio/') && !contentType.startsWith('video/')) {
      throw new ApiFailure(415, 'unsupported_media_type', 'รองรับเฉพาะไฟล์เสียง (webm, mp4, m4a, mp3, wav)');
    }

    const filename = assetPathname.split('/').pop() ?? 'voice.webm';
    const out = await transcribe(blob.data, filename, contentType);
    if (out.durationS !== null && out.durationS > MAX_AUDIO_SECONDS) {
      throw new ApiFailure(422, 'audio_too_long', 'ไฟล์เสียงยาวเกิน 3 นาที กรุณาอัดใหม่ให้สั้นลง');
    }
    const body: TranscribeResponse = { transcript: out.text, durationS: out.durationS };
    return c.json(body);
  });

  return r;
}
