import { internalFetch } from '@cvc/auth';
import { AppError, MSG } from './errors';
import { env } from './env';

function agentOrigin(): string {
  const origin = env.agentOrigin();
  if (origin) return origin;
  if (!env.isProduction()) return 'http://localhost:3002';
  throw new AppError(500, 'agent_not_configured', MSG.internal);
}

/** POST to an agent `/api/agent/internal/*` endpoint with Vercel OIDC (via @cvc/auth internalFetch). */
export async function postToAgent(path: string, body: unknown, timeoutMs = 15_000): Promise<Response> {
  const origin = agentOrigin();
  try {
    return await internalFetch(origin, path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    console.error('[api] agent call failed', path, e);
    throw new AppError(502, 'agent_unavailable', MSG.agentUnavailable);
  }
}
