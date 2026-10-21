import type { AuthUser } from '@cvc/auth';
import type { Context } from 'hono';
import { AppError } from './errors';
import { env } from './env';

/**
 * Vercel BotID for guest-facing endpoints. checkBotId() only works on the route the browser called in the project
 * that served the page, and a request rewritten from cvc-web reaches cvc-api without that context (every caller
 * looked like a bot). So cvc-web's route handler runs the check and marks the forwarded request with x-cvc-botid;
 * the marker is trusted because requireEdge() already proved the request came through cvc-web, which strips any
 * client-sent copy. Skipped outside a production Vercel deployment.
 */
export function assertNotBot(c: Context): void {
  if (!env.isProduction() || !env.onVercel()) return;
  if (c.req.header('x-cvc-botid') === 'human') return;
  throw new AppError(403, 'bot_detected', 'ระบบตรวจพบการใช้งานที่ผิดปกติ กรุณาลองใหม่จากเบราว์เซอร์');
}

/** Same marker for routes a non-LINE user can spend resources on (anyone can mint a Supabase session directly). */
export function assertHumanCaller(c: Context, user: AuthUser): void {
  if (user.local || (!user.isAnonymous && user.lineSub)) return;
  assertNotBot(c);
}
