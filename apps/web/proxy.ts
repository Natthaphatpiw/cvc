// Next.js 16 proxy (formerly middleware): forwards same-origin /api/* to the api and agent projects.
import { NextResponse, type NextRequest } from 'next/server';
import { isBotIdProtected } from './lib/botid-paths';
import { upstreamHeaders, upstreamOrigin } from './lib/upstream';

/** Service-to-service and cron routes are never reachable from the internet through this proxy. */
const BLOCKED = /^\/api\/(agent\/)?(internal|cron)(\/|$)/;

export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (BLOCKED.test(pathname)) return new NextResponse(null, { status: 404 });
  // BotID can only verify on this project's own route, so these go to app/api/... handlers that forward themselves.
  if (isBotIdProtected(req.method, pathname)) return NextResponse.next();

  const base = upstreamOrigin(pathname);
  return NextResponse.rewrite(new URL(pathname + search, base), { request: { headers: upstreamHeaders(req) } });
}

export const config = { matcher: ['/api/:path*'] };
