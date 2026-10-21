import { getVercelOidcToken } from '@vercel/oidc';

/** The project's own OIDC token on Vercel; null locally or when no token source is available. */
async function oidcToken(): Promise<string | null> {
  if (!process.env.VERCEL) return null;
  try {
    return await getVercelOidcToken();
  } catch {
    return null;
  }
}

/**
 * Service-to-service call (api ↔ agent `/internal/*`). On Vercel it authenticates with the project's OIDC token;
 * outside production it also sends x-cvc-edge, which requireOidc accepts as the local-dev fallback.
 */
export async function internalFetch(origin: string, path: string, init: RequestInit = {}): Promise<Response> {
  const base = /^https?:\/\//i.test(origin) ? origin : `https://${origin}`;
  const url = new URL(path, base);
  const headers = new Headers(init.headers);

  const token = await oidcToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  const edgeSecret = process.env.EDGE_SHARED_SECRET ?? '';
  if ((!token || process.env.NODE_ENV !== 'production') && edgeSecret) headers.set('x-cvc-edge', edgeSecret);

  // preview deployments sit behind Vercel Authentication
  const bypass = process.env.PREVIEW_BYPASS_SECRET ?? '';
  if (process.env.VERCEL_ENV === 'preview' && bypass) headers.set('x-vercel-protection-bypass', bypass);

  if (typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(url, { ...init, headers });
}
