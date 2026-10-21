import { Hono } from 'hono';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireEdge, requireUser } from '@cvc/auth';
import type { AppEnv } from '../types';
import { AppError, MSG, invalidRequest } from '../lib/errors';
import { env } from '../lib/env';
import { enforceRateLimit, isRecord, readJson, str } from '../lib/http';

export const uploadRoutes = new Hono<AppEnv>();

const MB = 1024 * 1024;

type UploadKind = 'image' | 'audio';

const LIMITS: Record<UploadKind, { allowedContentTypes: string[]; maximumSizeInBytes: number }> = {
  image: { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'], maximumSizeInBytes: 10 * MB },
  audio: {
    // MediaRecorder: audio/webm (Chrome/Android), audio/mp4 (iOS); file picker: m4a / mp3 / ogg / wav.
    allowedContentTypes: [
      'audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/mpeg',
      'audio/ogg', 'audio/ogg;codecs=opus', 'audio/wav', 'audio/x-wav', 'audio/wave',
    ],
    maximumSizeInBytes: 25 * MB,
  },
};

const EXT_KIND: Record<string, UploadKind> = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  webm: 'audio', mp4: 'audio', m4a: 'audio', mp3: 'audio', mpeg: 'audio', ogg: 'audio', oga: 'audio', wav: 'audio',
};

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Kind from the file extension (§8.7 `uploads/{sub}/{uploadId}.{ext}`), else from clientPayload `{ kind }`. */
function kindOf(fileName: string, clientPayload: string | null): UploadKind | null {
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
  const byExt = EXT_KIND[ext];
  if (byExt) return byExt;
  if (!clientPayload) return null;
  try {
    const p: unknown = JSON.parse(clientPayload);
    const kind = isRecord(p) ? p.kind : null;
    return kind === 'image' || kind === 'audio' ? kind : null;
  } catch {
    return null;
  }
}

function parseTokenRequest(body: unknown): HandleUploadBody | null {
  if (!isRecord(body) || body.type !== 'blob.generate-client-token' || !isRecord(body.payload)) return null;
  const { pathname, clientPayload, multipart } = body.payload;
  if (typeof pathname !== 'string') return null;
  return {
    type: 'blob.generate-client-token',
    payload: {
      pathname,
      clientPayload: typeof clientPayload === 'string' ? clientPayload : null,
      multipart: multipart === true,
    },
  };
}

/**
 * Client-upload token for the private Blob store (§10.5). Only token generation is handled: no onUploadCompleted
 * callback is registered (the callback would arrive without the user's bearer token), so `blob.upload-completed`
 * events are rejected. Private access: @vercel/blob 2.8.2 supports `access: 'private'`, but a client token cannot
 * carry the access mode (onBeforeGenerateToken has no `access` option); the browser passes `access: 'private'` to
 * `upload()` and the store behind BLOB_PRIVATE_READ_WRITE_TOKEN is a private store.
 */
uploadRoutes.post('/token', requireEdge(), requireUser({ allowAnonymous: true }), async (c) => {
  const token = env.privateBlobToken();
  if (!token) throw new AppError(501, 'blob_not_configured', MSG.blobNotConfigured);

  const body = parseTokenRequest(await readJson(c));
  if (!body) throw invalidRequest([{ path: ['type'], message: 'expected blob.generate-client-token' }]);

  const user = c.get('user');
  await enforceRateLimit(c, `rl:upload:${user.id}`, 30, 3600);
  const prefix = `uploads/${user.id}/`;

  const result = await handleUpload({
    token,
    request: c.req.raw,
    body,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const fileName = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
      if (!fileName || !FILE_NAME.test(fileName) || fileName.includes('..')) {
        throw new AppError(403, 'upload_path_forbidden', 'ตำแหน่งไฟล์ไม่ถูกต้อง');
      }
      const kind = kindOf(fileName, str(clientPayload));
      if (!kind) throw new AppError(400, 'upload_type_unsupported', 'รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WebP) และไฟล์เสียง');
      return {
        ...LIMITS[kind],
        addRandomSuffix: true,
        allowOverwrite: false,
        validUntil: Date.now() + 15 * 60 * 1000,
      };
    },
  });
  return c.json(result);
});
