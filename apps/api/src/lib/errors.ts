import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError } from '@cvc/schemas';

/** Thrown anywhere in a handler; rendered by `handleError` as the uniform `ApiError` body. */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly messageTh: string;
  readonly details: unknown;

  constructor(status: ContentfulStatusCode, code: string, messageTh: string, details?: unknown) {
    super(`${status} ${code}`);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.messageTh = messageTh;
    this.details = details;
  }
}

export const MSG = {
  invalidRequest: 'ข้อมูลที่ส่งมาไม่ถูกต้อง',
  invalidJson: 'รูปแบบข้อมูลไม่ถูกต้อง',
  unauthorized: 'กรุณาเข้าสู่ระบบอีกครั้ง',
  forbidden: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้',
  lineRequired: 'ฟีเจอร์นี้ต้องเข้าสู่ระบบด้วย LINE',
  notFound: 'ไม่พบข้อมูลที่ร้องขอ',
  conflict: 'ข้อมูลนี้มีอยู่แล้ว',
  rateLimited: 'มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่',
  internal: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง',
  upstream: 'ระบบภายนอกไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง',
  agentUnavailable: 'ระบบวิเคราะห์ไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง',
  supabaseNotConfigured: 'ยังไม่ได้ตั้งค่า Supabase ระบบจะใช้โหมดตัวอย่างในเบราว์เซอร์นี้',
  lineLoginNotConfigured: 'ยังไม่ได้ตั้งค่า LINE Login จึงยังเข้าสู่ระบบด้วย LINE ไม่ได้',
  lineMessagingNotConfigured: 'ยังไม่ได้ตั้งค่า LINE Messaging API',
  blobNotConfigured: 'ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (Vercel Blob) จึงยังอัปโหลดไฟล์ไม่ได้',
  notImplemented: 'ฟีเจอร์นี้จะเปิดให้ใช้ในระยะถัดไป',
} as const;

export function errorBody(code: string, messageTh: string, details?: unknown): ApiError {
  return details === undefined ? { error: { code, messageTh } } : { error: { code, messageTh, details } };
}

type Issue = { readonly path: readonly PropertyKey[]; readonly message: string };

/** 400 with zod issues flattened to `{ path, message }` (no input values echoed back). */
export function invalidRequest(issues: readonly Issue[]): AppError {
  const details = issues.slice(0, 20).map((i) => ({ path: i.path.map((p) => String(p)).join('.'), message: i.message }));
  return new AppError(400, 'invalid_request', MSG.invalidRequest, details);
}

function codeForStatus(status: number): { code: string; messageTh: string } {
  switch (status) {
    case 400: return { code: 'invalid_request', messageTh: MSG.invalidRequest };
    case 401: return { code: 'unauthorized', messageTh: MSG.unauthorized };
    case 403: return { code: 'forbidden', messageTh: MSG.forbidden };
    case 404: return { code: 'not_found', messageTh: MSG.notFound };
    case 409: return { code: 'conflict', messageTh: MSG.conflict };
    case 429: return { code: 'rate_limited', messageTh: MSG.rateLimited };
    default: return { code: 'internal_error', messageTh: MSG.internal };
  }
}

export function handleError(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    return c.json(errorBody(err.code, err.messageTh, err.details), err.status);
  }
  if (err instanceof HTTPException) {
    // Middlewares from @cvc/auth may attach a ready-made ApiError response.
    if (err.res) return err.getResponse();
    const { code, messageTh } = codeForStatus(err.status);
    return c.json(errorBody(code, messageTh), err.status);
  }
  console.error('[api] unhandled error', err);
  return c.json(errorBody('internal_error', MSG.internal), 500);
}

export function notFound(c: Context): Response {
  return c.json(errorBody('not_found', MSG.notFound), 404);
}

/** Postgres SQLSTATE of an error thrown by postgres.js (or any error carrying a string `code`). */
export function pgCode(e: unknown): string | null {
  if (typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string') return e.code;
  return null;
}
