// Server-only: BotID check on this project's route, then the same request goes to cvc-api / cvc-agent.
import type { NextRequest } from 'next/server';
import { checkBotId } from 'botid/server';
import { BOTID_HEADER, BOTID_HUMAN } from './botid-paths';
import { upstreamHeaders, upstreamOrigin } from './upstream';

const UPSTREAM_TIMEOUT_MS = 120_000;

/** Hop-by-hop and length/encoding headers must not be copied: fetch() already decoded and re-chunked the body. */
const DROP_RESPONSE_HEADERS = ['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive'];
/** Request headers undici's fetch rejects or must compute itself. */
const DROP_REQUEST_HEADERS = ['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'expect', 'te', 'trailer', 'proxy-connection'];

/** Same conditions as the client (instrumentation-client.ts) and the upstream checks: production on Vercel with guests. */
function botIdEnforced(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL === '1' && Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function botResponse(): Response {
  return Response.json(
    { error: { code: 'bot_detected', messageTh: 'ระบบตรวจพบการใช้งานที่ผิดปกติ กรุณาลองใหม่จากเบราว์เซอร์' } },
    { status: 403 },
  );
}

/**
 * Signed-in LINE users skip the browser check here (the LINE in-app browser is where BotID is least proven). LINE
 * identity is app_metadata.line_sub, which only our server can set; "not anonymous" alone is not enough because anyone
 * can sign up at Supabase directly. The claim is read without verification only to decide this: cvc-api / cvc-agent
 * verify the token and still demand the BotID marker from anyone who is not a LINE user, so a forged claim gets
 * nothing.
 */
function claimsLineUser(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = token?.split('.')[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      is_anonymous?: unknown;
      app_metadata?: { line_sub?: unknown };
    } | null;
    return claims?.is_anonymous === false && typeof claims.app_metadata?.line_sub === 'string';
  } catch {
    return false;
  }
}

/**
 * BotID verdict. When BotID itself cannot answer (an exception or a response without a boolean isBot, e.g. OIDC not
 * enabled on this project) the request is let through with a logged error, as before this check moved here: the
 * per-IP and per-user rate limits in cvc-api / cvc-agent stay the guard instead of locking every guest out.
 */
async function isHuman(): Promise<boolean> {
  try {
    const verdict = await checkBotId();
    if (typeof verdict.isBot !== 'boolean') {
      console.error('[web] BotID returned no verdict; allowing the request', verdict);
      return true;
    }
    return !verdict.isBot || verdict.isVerifiedBot === true;
  } catch (err) {
    console.error('[web] BotID unavailable; allowing the request', err instanceof Error ? err.message : err);
    return true;
  }
}

export async function forwardWithBotId(req: NextRequest, opts: { alwaysCheck?: boolean } = {}): Promise<Response> {
  const headers = upstreamHeaders(req);
  if (botIdEnforced() && (opts.alwaysCheck || !claimsLineUser(req))) {
    if (!(await isHuman())) return botResponse();
    headers.set(BOTID_HEADER, BOTID_HUMAN);
  }
  for (const h of DROP_REQUEST_HEADERS) headers.delete(h);

  const { pathname, search } = req.nextUrl;
  let upstream: Response;
  try {
    upstream = await fetch(new URL(pathname + search, upstreamOrigin(pathname)), {
      method: req.method,
      headers,
      body: await req.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[web] upstream request failed', pathname, err instanceof Error ? err.message : err);
    return Response.json(
      { error: { code: 'upstream_unavailable', messageTh: 'เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' } },
      { status: 502 },
    );
  }

  const out = new Headers(upstream.headers);
  for (const h of DROP_RESPONSE_HEADERS) out.delete(h);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
