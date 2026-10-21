import type { AuthUser, AuthVariables } from '@cvc/auth';
import { rateLimit } from '@cvc/cache';
import { getAgentStore, type RunRecord } from '@cvc/db';
import { Uuid, type ApiError, type FinalResult } from '@cvc/schemas';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

export type AppEnv = { Variables: AuthVariables };
export type AppContext = Context<AppEnv>;

/** Thrown anywhere in a handler; rendered as the uniform `{ error: { code, messageTh, details? } }` body. */
export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly messageTh: string;
  readonly details: unknown;

  constructor(status: number, code: string, messageTh: string, details?: unknown) {
    super(code);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = code;
    this.messageTh = messageTh;
    this.details = details;
  }
}

export function errorResponse(status: number, code: string, messageTh: string, details?: unknown): Response {
  const body: ApiError = { error: details === undefined ? { code, messageTh } : { code, messageTh, details } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const STATUS_DEFAULTS: Record<number, { code: string; messageTh: string }> = {
  400: { code: 'bad_request', messageTh: 'คำขอไม่ถูกต้อง' },
  401: { code: 'unauthorized', messageTh: 'กรุณาเข้าสู่ระบบอีกครั้ง' },
  403: { code: 'forbidden', messageTh: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' },
  404: { code: 'not_found', messageTh: 'ไม่พบข้อมูลที่ต้องการ' },
  409: { code: 'conflict', messageTh: 'สถานะของข้อมูลไม่รองรับคำขอนี้' },
  429: { code: 'rate_limited', messageTh: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
};

export function handleError(err: Error, _c: AppContext): Response {
  if (err instanceof ApiFailure) return errorResponse(err.status, err.code, err.messageTh, err.details);
  if (err instanceof HTTPException) {
    if (err.res) return err.res;
    const d = STATUS_DEFAULTS[err.status] ?? { code: 'http_error', messageTh: 'เกิดข้อผิดพลาดในการประมวลผลคำขอ' };
    return errorResponse(err.status, d.code, d.messageTh);
  }
  console.error('[agent] unhandled error', err);
  return errorResponse(500, 'internal_error', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง');
}

export function notFoundResponse(): Response {
  return errorResponse(404, 'route_not_found', 'ไม่พบเส้นทางที่เรียก');
}

type Issue = { readonly path: ReadonlyArray<PropertyKey>; readonly message: string };

export function validationFailure(issues: ReadonlyArray<Issue>): ApiFailure {
  return new ApiFailure(
    400,
    'invalid_request',
    'ข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่',
    issues.slice(0, 20).map((i) => ({ path: i.path.map((p) => String(p)).join('.'), message: i.message })),
  );
}

/** Reads a JSON body; an empty body is treated as `{}` so schemas with defaults still apply. */
export async function readJson(c: AppContext): Promise<unknown> {
  const text = await c.req.text();
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiFailure(400, 'invalid_json', 'รูปแบบข้อมูล JSON ไม่ถูกต้อง');
  }
}

export function currentUser(c: AppContext): AuthUser {
  return c.get('user');
}

export function isGuest(user: AuthUser): boolean {
  return user.isAnonymous || user.local;
}

export async function enforceRateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const r = await rateLimit(key, limit, windowSec);
  if (!r.ok) {
    const minutes = Math.max(1, Math.ceil(r.resetSec / 60));
    throw new ApiFailure(429, 'rate_limited', `ส่งคำขอบ่อยเกินไป กรุณาลองใหม่ในอีก ${minutes} นาที`, {
      resetSec: r.resetSec,
    });
  }
}

const RUN_NOT_FOUND_TH = 'ไม่พบการวิเคราะห์นี้ หรือคุณไม่มีสิทธิ์เข้าถึง';
const RESULT_NOT_FOUND_TH = 'ไม่พบผลการวิเคราะห์นี้ หรือคุณไม่มีสิทธิ์เข้าถึง';

/** Owner check: a run that belongs to someone else is reported as missing (404), never 403. */
export async function loadOwnedRun(runId: string, user: AuthUser): Promise<RunRecord> {
  if (!Uuid.safeParse(runId).success) throw new ApiFailure(404, 'run_not_found', RUN_NOT_FOUND_TH);
  const run = await getAgentStore().getRun(runId);
  if (!run || run.ownerId !== user.id) throw new ApiFailure(404, 'run_not_found', RUN_NOT_FOUND_TH);
  return run;
}

export async function loadOwnedResult(resultId: string, user: AuthUser): Promise<FinalResult> {
  if (!Uuid.safeParse(resultId).success) throw new ApiFailure(404, 'result_not_found', RESULT_NOT_FOUND_TH);
  const found = await getAgentStore().getResult(resultId);
  if (!found || found.ownerId !== user.id) throw new ApiFailure(404, 'result_not_found', RESULT_NOT_FOUND_TH);
  return found.result;
}
