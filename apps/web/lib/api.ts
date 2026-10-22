import {
  ApiError as ApiErrorBody,
  AssistResponse,
  ChatSessionResponse,
  ClaimRequest,
  ClaimResponse,
  ConsentRequest,
  CreateRunResponse,
  FinalResult,
  HealthResponse,
  HistoryResponse,
  MeResponse,
  PersonasResponse,
  RescoreRequest,
  RescoreResponse,
  RunEventsResponse,
  RunStatusResponse,
  SavedResult,
  SaveResultRequest,
  SessionTokens,
  TranscribeResponse,
  UpdateSavedRequest,
  FeedbackRequest,
  type AssistRequestInput,
  type RunInputDraft,
} from '@cvc/schemas';
import { getSupabase } from './supabase';

/** Anything with a zod-style `parse` (every `@cvc/schemas` schema qualifies). */
export type ResponseSchema<T> = { parse(data: unknown): T };

export type ClaimItem = (typeof ClaimRequest)['_output']['items'][number];
export type ClaimResult = (typeof ClaimResponse)['_output'];
export type ConsentBody = (typeof ConsentRequest)['_output'];
export type SaveResultBody = (typeof SaveResultRequest)['_input'];
export type UpdateSavedBody = (typeof UpdateSavedRequest)['_input'];
export type RescoreBody = (typeof RescoreRequest)['_input'];
export type FeedbackBody = (typeof FeedbackRequest)['_input'];

export const DEFAULT_ERROR_TH = 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
const NETWORK_ERROR_TH = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';

const STATUS_MESSAGES_TH: Record<number, string> = {
  401: 'เซสชันหมดอายุ กรุณาโหลดหน้านี้ใหม่',
  403: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้',
  404: 'ไม่พบข้อมูลที่ต้องการ',
  413: 'ไฟล์มีขนาดใหญ่เกินกำหนด',
  429: 'ใช้งานครบโควตาชั่วโมงนี้แล้ว กรุณาลองใหม่ภายหลัง',
  501: 'ฟีเจอร์นี้ยังไม่ได้ตั้งค่าในระบบนี้',
  503: 'ระบบไม่พร้อมให้บริการชั่วคราว กรุณาลองใหม่ภายหลัง',
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly messageTh: string;
  readonly details?: unknown;

  constructor(status: number, code: string, messageTh?: string, details?: unknown) {
    const msg = messageTh && messageTh.trim() ? messageTh : (STATUS_MESSAGES_TH[status] ?? DEFAULT_ERROR_TH);
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.messageTh = msg;
    this.details = details;
  }
}

/** Thai message for any thrown value (ApiError keeps the server's messageTh). */
export function errorMessageTh(e: unknown): string {
  if (e instanceof ApiError) return e.messageTh;
  return DEFAULT_ERROR_TH;
}

// ---------- guest id (local demo identity) ----------

const GUEST_ID_KEY = 'cvc:guest-id';
let memoryGuestId: string | null = null;

function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC 4122 v4 from getRandomValues (older WebViews without randomUUID).
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Stable per-browser UUID sent as x-cvc-guest-id when there is no Supabase session. Null on the server. */
export function getGuestId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const id = newUuid();
    window.localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    // Storage blocked (private mode, LIFF quirks): keep one id for this page lifetime.
    memoryGuestId ??= newUuid();
    return memoryGuestId;
  }
}

// ---------- session gate ----------

let sessionGate: Promise<unknown> | null = null;

/**
 * SessionProvider registers its bootstrap promise here so requests made while the guest session is being created
 * wait for it instead of going out without credentials. Session calls themselves pass `waitForSession: false`.
 */
export function setSessionGate(p: Promise<unknown> | null): void {
  sessionGate = p;
}

let sessionRecovery: (() => Promise<unknown>) | null = null;

/**
 * SessionProvider registers how to (re)create the guest session. A request about to go out without a session (the
 * page-load attempt failed, or the session was lost) runs it once first instead of being sent without credentials.
 */
export function setSessionRecovery(fn: (() => Promise<unknown>) | null): void {
  sessionRecovery = fn;
}

async function accessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Supabase user id when signed in, otherwise the local guest id. Used for upload pathnames `uploads/{userId}/…`. */
export async function currentUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.auth.getSession();
      if (data.session?.user.id) return data.session.user.id;
    } catch {
      // fall through to the guest id
    }
  }
  return getGuestId();
}

/** Authorization (Supabase access token) or x-cvc-guest-id for the local demo. */
export async function authHeaders(opts: { waitForSession?: boolean } = {}): Promise<Record<string, string>> {
  if (opts.waitForSession !== false && sessionGate) {
    await sessionGate.catch(() => undefined);
  }
  let token = await accessToken();
  if (!token && opts.waitForSession !== false && sessionRecovery) {
    await sessionRecovery().catch(() => undefined);
    token = await accessToken();
  }
  if (token) return { authorization: `Bearer ${token}` };
  const guestId = getGuestId();
  return guestId ? { 'x-cvc-guest-id': guestId } : {};
}

// ---------- fetch ----------

export type ApiFetchInit<T> = RequestInit & {
  /** JSON body; sets content-type. */
  json?: unknown;
  /** Validates the response body; a mismatch becomes ApiError('invalid_response'). */
  schema?: ResponseSchema<T>;
  /** Default true. Session bootstrap calls pass false. */
  waitForSession?: boolean;
};

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = null;
  }
  const parsed = ApiErrorBody.safeParse(body);
  if (parsed.success) {
    const { code, messageTh, details } = parsed.data.error;
    return new ApiError(res.status, code, messageTh, details);
  }
  // Some routes (e.g. 501 stubs) answer { code } without the envelope.
  const code =
    body && typeof body === 'object' && 'code' in body && typeof (body as { code: unknown }).code === 'string'
      ? (body as { code: string }).code
      : `http_${res.status}`;
  return new ApiError(res.status, code);
}

/** Same-origin fetch through proxy.ts with auth headers, JSON handling and Thai errors. */
export async function apiFetch<T>(path: string, init: ApiFetchInit<T> = {}): Promise<T> {
  const { json, schema, waitForSession, headers: initHeaders, body: initBody, ...rest } = init;
  const headers = new Headers(initHeaders);
  const auth = await authHeaders({ waitForSession });
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  let body: BodyInit | null | undefined = initBody;
  if (json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(path, { ...rest, headers, body, credentials: 'same-origin' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', NETWORK_ERROR_TH);
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204 || res.status === 205) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(res.status, 'invalid_response');
  }
  if (!schema) return data as T;
  try {
    return schema.parse(data);
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.error(`[apiFetch] ${path} response failed validation`, e);
    throw new ApiError(res.status, 'invalid_response');
  }
}

const enc = encodeURIComponent;

/** Accepts `[...]`, `{ items: [...] }` or `{ savedResults: [...] }` so the list call survives either API shape. */
const SavedListSchema: ResponseSchema<SavedResult[]> = {
  parse(data) {
    const list =
      Array.isArray(data)
        ? data
        : data && typeof data === 'object'
          ? ((data as Record<string, unknown>).items ?? (data as Record<string, unknown>).savedResults)
          : undefined;
    if (!Array.isArray(list)) throw new Error('expected a list of saved results');
    return list.map((item) => SavedResult.parse(item));
  },
};

/** Accepts the saved row itself or `{ item }` / `{ savedResult }`. */
const SavedOneSchema: ResponseSchema<SavedResult> = {
  parse(data) {
    const direct = SavedResult.safeParse(data);
    if (direct.success) return direct.data;
    if (data && typeof data === 'object') {
      const o = data as Record<string, unknown>;
      return SavedResult.parse(o.item ?? o.savedResult);
    }
    throw new Error('expected a saved result');
  },
};

// ---------- agent (/api/agent/*) ----------

export const agentApi = {
  health(): Promise<HealthResponse> {
    return apiFetch('/api/agent/health', { schema: HealthResponse, waitForSession: false });
  },
  createRun(input: RunInputDraft): Promise<CreateRunResponse> {
    return apiFetch('/api/agent/runs', { method: 'POST', json: input, schema: CreateRunResponse });
  },
  getRun(id: string): Promise<RunStatusResponse> {
    return apiFetch(`/api/agent/runs/${enc(id)}`, { schema: RunStatusResponse, cache: 'no-store' });
  },
  events(id: string, after: number): Promise<RunEventsResponse> {
    return apiFetch(`/api/agent/runs/${enc(id)}/events?after=${after}`, { schema: RunEventsResponse, cache: 'no-store' });
  },
  async cancel(id: string): Promise<void> {
    await apiFetch<unknown>(`/api/agent/runs/${enc(id)}/cancel`, { method: 'POST' });
  },
  getResult(id: string): Promise<FinalResult> {
    return apiFetch(`/api/agent/results/${enc(id)}`, { schema: FinalResult });
  },
  rescore(id: string, body: RescoreBody): Promise<RescoreResponse> {
    return apiFetch(`/api/agent/results/${enc(id)}/rescore`, { method: 'POST', json: body, schema: RescoreResponse });
  },
  async feedback(id: string, body: FeedbackBody): Promise<void> {
    await apiFetch<unknown>(`/api/agent/results/${enc(id)}/feedback`, { method: 'POST', json: body });
  },
  chatSession(resultId: string): Promise<ChatSessionResponse> {
    return apiFetch(`/api/agent/chat/${enc(resultId)}/session`, { schema: ChatSessionResponse, cache: 'no-store' });
  },
  resetChat(resultId: string): Promise<ChatSessionResponse> {
    return apiFetch(`/api/agent/chat/${enc(resultId)}/reset`, { method: 'POST', schema: ChatSessionResponse });
  },
  transcribe(assetPathname: string): Promise<TranscribeResponse> {
    return apiFetch('/api/agent/transcribe', { method: 'POST', json: { assetPathname }, schema: TranscribeResponse });
  },
  /** The form's AI prompt bar: fills the audience or campaign section for the user to edit before submitting. */
  assist(req: AssistRequestInput, signal?: AbortSignal): Promise<AssistResponse> {
    return apiFetch('/api/agent/assist', { method: 'POST', json: req, schema: AssistResponse, signal });
  },
};

// ---------- system (/api/*) ----------

export const systemApi = {
  health(): Promise<HealthResponse> {
    return apiFetch('/api/health', { schema: HealthResponse, waitForSession: false });
  },
  personas(): Promise<PersonasResponse> {
    return apiFetch('/api/personas', { schema: PersonasResponse, waitForSession: false });
  },
  me(opts: { waitForSession?: boolean } = {}): Promise<MeResponse> {
    return apiFetch('/api/me', { schema: MeResponse, cache: 'no-store', waitForSession: opts.waitForSession });
  },
  bootstrap(opts: { waitForSession?: boolean } = {}): Promise<MeResponse> {
    return apiFetch('/api/me/bootstrap', { method: 'POST', schema: MeResponse, waitForSession: opts.waitForSession });
  },
  async consent(body: ConsentBody): Promise<void> {
    await apiFetch<unknown>('/api/me/consents', { method: 'POST', json: body });
  },
  async deleteMe(): Promise<void> {
    await apiFetch<unknown>('/api/me', { method: 'DELETE' });
  },
  history(cursor?: string | null): Promise<HistoryResponse> {
    const q = cursor ? `?cursor=${enc(cursor)}` : '';
    return apiFetch(`/api/history${q}`, { schema: HistoryResponse, cache: 'no-store' });
  },
  listSaved(): Promise<SavedResult[]> {
    return apiFetch('/api/saved-results', { schema: SavedListSchema, cache: 'no-store' });
  },
  saveResult(body: SaveResultBody, opts: { waitForSession?: boolean } = {}): Promise<SavedResult> {
    return apiFetch('/api/saved-results', {
      method: 'POST',
      json: body,
      schema: SavedOneSchema,
      waitForSession: opts.waitForSession,
    });
  },
  updateSaved(id: string, patch: UpdateSavedBody): Promise<SavedResult> {
    return apiFetch(`/api/saved-results/${enc(id)}`, { method: 'PATCH', json: patch, schema: SavedOneSchema });
  },
  async deleteSaved(id: string): Promise<void> {
    await apiFetch<unknown>(`/api/saved-results/${enc(id)}`, { method: 'DELETE' });
  },
  claim(items: ClaimItem[], opts: { waitForSession?: boolean } = {}): Promise<ClaimResult> {
    return apiFetch('/api/auth/claim', {
      method: 'POST',
      json: { items: items.slice(0, 50) },
      schema: ClaimResponse,
      waitForSession: opts.waitForSession,
    });
  },
  /** Anonymous Supabase session for a web guest (501 when Supabase is not configured on the API). */
  guest(noticeVersion: string): Promise<SessionTokens> {
    return apiFetch('/api/auth/guest', {
      method: 'POST',
      json: { noticeVersion },
      schema: SessionTokens,
      waitForSession: false,
    });
  },
  /** Fallback B: LINE ID token → Supabase session. */
  lineExchange(idToken: string): Promise<SessionTokens> {
    return apiFetch('/api/auth/line/exchange', {
      method: 'POST',
      json: { idToken },
      schema: SessionTokens,
      waitForSession: false,
    });
  },
};
