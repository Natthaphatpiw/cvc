import { checkBotId } from 'botid/server';
import { AppError } from './errors';
import { env } from './env';

/**
 * Vercel BotID for guest-facing endpoints. Skipped outside a production Vercel deployment (it needs the
 * request context and OIDC). The request reaches cvc-api through the web proxy rewrite, which forwards the
 * client's BotID headers; whether classification survives the rewrite is spike [SP7], so an infrastructure
 * failure is logged and the per-IP rate limit remains the guard instead of locking every guest out.
 */
export async function assertNotBot(): Promise<void> {
  if (!env.isProduction() || !env.onVercel()) return;
  let verdict: Awaited<ReturnType<typeof checkBotId>>;
  try {
    verdict = await checkBotId();
  } catch (e) {
    console.warn('[api] BotID check unavailable', e);
    return;
  }
  if (verdict.isBot && !verdict.isVerifiedBot) {
    throw new AppError(403, 'bot_detected', 'ระบบตรวจพบการใช้งานที่ผิดปกติ กรุณาลองใหม่จากเบราว์เซอร์');
  }
}
