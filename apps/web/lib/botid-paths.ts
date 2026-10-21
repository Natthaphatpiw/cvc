/**
 * POST routes guarded by Vercel BotID. Shared by the client (instrumentation-client.ts attaches the challenge headers)
 * and the server: checkBotId() only works on the route the browser called in this project, so proxy.ts lets these
 * through to web route handlers (app/api/...) that check and then forward to cvc-api / cvc-agent.
 * Guest sessions can also be minted directly at Supabase with the public key, so every route a guest can spend
 * resources on is listed here (uploads included: our Blob upload has no server callback that BotID could block).
 */
export const BOTID_PROTECTED_POSTS = ['/api/auth/guest', '/api/agent/runs', '/api/agent/transcribe', '/api/uploads/token'] as const;

/** Set by the web route handlers after checkBotId() passes; cvc-api / cvc-agent trust it only behind x-cvc-edge. */
export const BOTID_HEADER = 'x-cvc-botid';
export const BOTID_HUMAN = 'human';

export function isBotIdProtected(method: string, pathname: string): boolean {
  return method === 'POST' && (BOTID_PROTECTED_POSTS as readonly string[]).includes(pathname);
}
