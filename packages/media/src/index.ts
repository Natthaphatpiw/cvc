import { del, get, list, put } from '@vercel/blob';

// Two Blob stores (§8.7): public `creator-media/*` (CREATOR_MEDIA_BLOB_READ_WRITE_TOKEN) and private `uploads/*`, `raw/*`
// (BLOB_PRIVATE_READ_WRITE_TOKEN). Tokens are always passed explicitly because neither store uses the SDK's default
// BLOB_READ_WRITE_TOKEN; an explicit token also takes priority over VERCEL_OIDC_TOKEN.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CACHE_MAX_AGE_S = 30 * 24 * 60 * 60;
const AVATAR_PREFIX = 'creator-media/avatars/';
const COVER_PREFIX = 'creator-media/covers/';

const EXT_BY_TYPE: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function env(name: string): string | null {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

const publicToken = () => env('CREATOR_MEDIA_BLOB_READ_WRITE_TOKEN');
const privateToken = () => env('BLOB_PRIVATE_READ_WRITE_TOKEN');

export function isCreatorMediaConfigured(): boolean {
  return publicToken() !== null;
}

export function isPrivateBlobConfigured(): boolean {
  return privateToken() !== null;
}

/** Path segment safe for Blob pathnames (no slashes, dots or traversal). */
function safeSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i;

/** Only public http(s) image hosts; blocks obvious SSRF targets (loopback, private ranges, link-local). */
function allowedSource(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (PRIVATE_HOST.test(u.hostname) || u.hostname.endsWith('.internal') || u.hostname.endsWith('.local')) return null;
  return u;
}

/** Fetches with one overall timeout, following at most 3 redirects and re-checking every hop. null = blocked URL. */
async function fetchImage(raw: string): Promise<Response | null> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let url = allowedSource(raw);
  for (let hop = 0; url && hop <= 3; hop++) {
    const res = await fetch(url, {
      signal,
      redirect: 'manual',
      headers: { accept: 'image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.1' },
    });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return res;
    await res.body?.cancel().catch(() => undefined);
    url = allowedSource(new URL(location, url).toString());
  }
  return null;
}

/** Reads a response body, giving up once it exceeds `max` bytes. */
async function readCapped(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function warn(msg: string): void {
  console.warn(`[media] ${msg}`);
}

/**
 * Copies a creator image (TikTok CDN URLs expire) into the public store and returns its permanent URL.
 * Returns null when unconfigured, when `sourceUrl` is null, or on any failure (one log line, never throws).
 */
export async function cacheCreatorImage(a: {
  creatorId: string;
  sourceUrl: string | null;
  kind: 'avatar' | 'cover';
  key?: string;
}): Promise<string | null> {
  const token = publicToken();
  if (!token || !a.sourceUrl) return null;
  try {
    const res = await fetchImage(a.sourceUrl);
    if (!res) {
      warn(`skip ${a.kind} for ${a.creatorId}: source URL not allowed or too many redirects`);
      return null;
    }
    if (!res.ok) {
      warn(`skip ${a.kind} for ${a.creatorId}: HTTP ${res.status}`);
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    const ext = EXT_BY_TYPE[contentType];
    if (!contentType.startsWith('image/') || !ext) {
      warn(`skip ${a.kind} for ${a.creatorId}: unsupported content-type "${contentType}"`);
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const declared = Number(res.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      warn(`skip ${a.kind} for ${a.creatorId}: ${declared} bytes exceeds limit`);
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const bytes = await readCapped(res, MAX_IMAGE_BYTES);
    if (!bytes || bytes.byteLength === 0) {
      warn(`skip ${a.kind} for ${a.creatorId}: empty or larger than ${MAX_IMAGE_BYTES} bytes`);
      return null;
    }

    const id = safeSegment(a.creatorId);
    const pathname =
      a.kind === 'avatar'
        ? `${AVATAR_PREFIX}${id}.${ext}`
        : `${COVER_PREFIX}${id}/${safeSegment(a.key ?? (await sha256Hex(a.sourceUrl)).slice(0, 24))}.${ext}`;
    const blob = await put(pathname, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
      access: 'public',
      token,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: CACHE_MAX_AGE_S,
    });
    return blob.url;
  } catch (err) {
    warn(`cache ${a.kind} for ${a.creatorId} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function listPathnames(token: string, prefix: string, keep: (pathname: string) => boolean): Promise<string[]> {
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ token, prefix, cursor, limit: 1000 });
    for (const b of page.blobs) if (keep(b.pathname)) urls.push(b.url);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return urls;
}

/** Deletes the creator's cached avatar (any extension) and covers. Used on opt-out and retention. */
export async function deleteCreatorMedia(creatorId: string): Promise<void> {
  const token = publicToken();
  if (!token) return;
  const id = safeSegment(creatorId);
  // `creator-media/avatars/{id}` would also match ids sharing the prefix, so keep only `{id}.<ext>`.
  const avatarPrefix = `${AVATAR_PREFIX}${id}`;
  const [avatars, covers] = await Promise.all([
    listPathnames(token, avatarPrefix, (p) => p.startsWith(`${avatarPrefix}.`)),
    listPathnames(token, `${COVER_PREFIX}${id}/`, () => true),
  ]);
  const urls = [...avatars, ...covers];
  for (let i = 0; i < urls.length; i += 500) {
    await del(urls.slice(i, i + 500), { token });
  }
}

/**
 * Reads a file from the private store (e.g. `uploads/{userId}/{uploadId}.webm`). @vercel/blob 2.8.2 supports private
 * reads natively through `get(pathname, { access: 'private', token })`, which authenticates with the store token and
 * resolves the store from it. Returns null when unconfigured, not found, or unreadable (logged).
 */
export async function readPrivateBlob(pathname: string): Promise<{ data: ArrayBuffer; contentType: string } | null> {
  const token = privateToken();
  if (!token) return null;
  const clean = pathname.replace(/^\/+/, '');
  if (!clean || clean.split('/').some((seg) => seg === '..' || seg === '.')) {
    warn(`readPrivateBlob: rejected pathname "${pathname}"`);
    return null;
  }
  try {
    const result = await get(clean, { access: 'private', token, useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const data = await new Response(result.stream).arrayBuffer();
    return { data, contentType: result.blob.contentType || 'application/octet-stream' };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name !== 'BlobNotFoundError') warn(`readPrivateBlob ${clean} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Two-letter avatar fallback: 'cvcdemo_skin_mali' → 'SK', '@john.doe' → 'JO'. */
export function initialsFor(handle: string): string {
  const base = handle.trim().replace(/^@+/, '').replace(/^cvcdemo_/i, '');
  const letters = Array.from(base).filter((ch) => /\p{L}/u.test(ch));
  const chosen = letters.length > 0 ? letters : Array.from(base).filter((ch) => /\p{N}/u.test(ch));
  const initials = chosen.slice(0, 2).join('');
  return initials ? initials.toUpperCase() : '?';
}
