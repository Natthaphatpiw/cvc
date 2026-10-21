import type { RunAsset } from '@cvc/schemas';
import { ApiError, authHeaders, currentUserId } from './api';

export const UPLOAD_TOKEN_URL = '/api/uploads/token';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_SEC = 180;

export type UploadAvailability = 'available' | 'unavailable';

/**
 * Asks the token route whether client uploads are configured. The API answers 501 when the private Blob store is
 * not set up (local demo); a 404 means the route does not exist in this deployment. Anything else (including the
 * 400 an empty probe body earns) means uploads can be tried.
 */
export async function probeUploads(): Promise<UploadAvailability> {
  try {
    const headers = await authHeaders();
    const res = await fetch(UPLOAD_TOKEN_URL, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ type: 'probe' }),
      credentials: 'same-origin',
    });
    return res.status === 501 || res.status === 404 ? 'unavailable' : 'available';
  } catch {
    return 'available';
  }
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
};

const TYPE_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
};

/** Content type without parameters; falls back to the file extension when the browser reports none. */
export function resolveContentType(file: Blob, fileName: string): string {
  const fromBlob = (file.type || '').split(';')[0]?.trim().toLowerCase();
  if (fromBlob) return fromBlob;
  const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
  return TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}

function randomId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}

/**
 * The API accepts only `uploads/{userId}/{fileName}` with a flat, ASCII file name and decides image vs audio by
 * the extension (clientPayload `{ kind }` as a fallback).
 */
function uploadPathname(userId: string, kind: RunAsset['kind'], contentType: string, fileName: string): string {
  const nameExt = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
  const ext = EXT_BY_TYPE[contentType] ?? (/^[a-z0-9]{1,5}$/.test(nameExt) ? nameExt : 'bin');
  return `uploads/${userId}/${kind}-${Date.now().toString(36)}-${randomId()}.${ext}`;
}

export type UploadArgs = {
  file: Blob;
  fileName: string;
  contentType: string;
  kind: RunAsset['kind'];
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
};

/** Uploads to the private store as `uploads/{userId}/{kind}-{id}.{ext}` through the API's handleUpload route. */
export async function uploadAsset({ file, fileName, contentType, kind, onProgress, signal }: UploadArgs): Promise<RunAsset> {
  // Headers first: authHeaders() waits for the session and may (re)create the guest session, which changes the id.
  const headers = await authHeaders();
  const userId = await currentUserId();
  if (!userId) throw new ApiError(401, 'no_session', 'ยังไม่พร้อมอัปโหลด กรุณาโหลดหน้านี้ใหม่');
  const { upload } = await import('@vercel/blob/client');
  const pathname = uploadPathname(userId, kind, contentType, fileName);
  try {
    const res = await upload(pathname, file, {
      access: 'private',
      handleUploadUrl: UPLOAD_TOKEN_URL,
      headers,
      contentType,
      clientPayload: JSON.stringify({ kind: contentType.startsWith('audio/') ? 'audio' : 'image' }),
      multipart: file.size > 8 * 1024 * 1024,
      abortSignal: signal,
      onUploadProgress: onProgress ? (e) => onProgress(Math.round(e.percentage)) : undefined,
    });
    return { pathname: res.pathname, kind, contentType: res.contentType || contentType, sizeBytes: file.size };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'upload_failed', 'อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
}

/** Reads an audio file's duration in seconds (null when the browser cannot tell). */
export function audioDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
