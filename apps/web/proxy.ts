// Next.js 16 proxy (formerly middleware): forwards same-origin /api/* to the api and agent projects.
import { NextResponse, type NextRequest } from 'next/server';
import { withRelatedProject } from '@vercel/related-projects';
import { ipAddress } from '@vercel/functions';

/** Service-to-service and cron routes are never reachable from the internet through this proxy. */
const BLOCKED = /^\/api\/(agent\/)?(internal|cron)(\/|$)/;

function agentOrigin(): string {
  return withRelatedProject({
    projectName: process.env.VERCEL_PROJECT_AGENT || 'cvc-agent',
    defaultHost: process.env.AGENT_ORIGIN || 'http://localhost:3002',
  });
}

function apiOrigin(): string {
  return withRelatedProject({
    projectName: process.env.VERCEL_PROJECT_API || 'cvc-api',
    defaultHost: process.env.API_ORIGIN || 'http://localhost:3001',
  });
}

function clientIp(req: NextRequest): string {
  const fromVercel = ipAddress(req);
  if (fromVercel) return fromVercel;
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  if (BLOCKED.test(pathname)) return new NextResponse(null, { status: 404 });

  const isAgent = pathname === '/api/agent' || pathname.startsWith('/api/agent/');
  const base = isAgent ? agentOrigin() : apiOrigin();

  const headers = new Headers(req.headers);
  // Overwrite anything a client may have sent for these trusted headers.
  headers.delete('x-cvc-edge');
  headers.delete('x-cvc-client-ip');
  headers.delete('x-vercel-protection-bypass');
  const edgeSecret = process.env.EDGE_SHARED_SECRET;
  if (edgeSecret) headers.set('x-cvc-edge', edgeSecret);
  headers.set('x-cvc-client-ip', clientIp(req));
  const bypass = process.env.PREVIEW_BYPASS_SECRET;
  if (process.env.VERCEL_ENV === 'preview' && bypass) headers.set('x-vercel-protection-bypass', bypass);

  return NextResponse.rewrite(new URL(pathname + search, base), { request: { headers } });
}

export const config = { matcher: ['/api/:path*'] };
