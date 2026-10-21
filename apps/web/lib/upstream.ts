// Server-only: where /api/* goes and which trusted headers it carries. Used by proxy.ts and the BotID route handlers.
import type { NextRequest } from 'next/server';
import { withRelatedProject } from '@vercel/related-projects';
import { ipAddress } from '@vercel/functions';
import { BOTID_HEADER } from './botid-paths';

export function agentOrigin(): string {
  return withRelatedProject({
    projectName: process.env.VERCEL_PROJECT_AGENT || 'cvc-agent',
    defaultHost: process.env.AGENT_ORIGIN || 'http://localhost:3002',
  });
}

export function apiOrigin(): string {
  return withRelatedProject({
    projectName: process.env.VERCEL_PROJECT_API || 'cvc-api',
    defaultHost: process.env.API_ORIGIN || 'http://localhost:3001',
  });
}

export function upstreamOrigin(pathname: string): string {
  return pathname === '/api/agent' || pathname.startsWith('/api/agent/') ? agentOrigin() : apiOrigin();
}

function clientIp(req: NextRequest): string {
  const fromVercel = ipAddress(req);
  if (fromVercel) return fromVercel;
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

/** The client's headers with every trusted header removed, then set by us (a client may send any of them). */
export function upstreamHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  headers.delete('x-cvc-edge');
  headers.delete('x-cvc-client-ip');
  headers.delete('x-vercel-protection-bypass');
  headers.delete(BOTID_HEADER);
  const edgeSecret = process.env.EDGE_SHARED_SECRET;
  if (edgeSecret) headers.set('x-cvc-edge', edgeSecret);
  headers.set('x-cvc-client-ip', clientIp(req));
  const bypass = process.env.PREVIEW_BYPASS_SECRET;
  if (process.env.VERCEL_ENV === 'preview' && bypass) headers.set('x-vercel-protection-bypass', bypass);
  return headers;
}
