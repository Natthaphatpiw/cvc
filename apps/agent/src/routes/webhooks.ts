import { timingSafeEqualStr } from '@cvc/auth';
import { Hono } from 'hono';
import { envString } from '../env';
import { ApiFailure, type AppEnv } from '../http';

/**
 * Apify run-finished webhook (§3.6). The body is never trusted. The MVP waits for Apify synchronously inside the
 * prefetch step, so a valid signal is only acknowledged; phase 2 verifies the run through the Apify API and resumes
 * the waiting workflow hook.
 */
export function webhookRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/webhooks/apify', async (c) => {
    const expected = envString('APIFY_WEBHOOK_SECRET');
    const given = c.req.query('secret') ?? '';
    if (!expected || !given || !timingSafeEqualStr(given, expected)) {
      throw new ApiFailure(401, 'invalid_webhook_secret', 'ไม่มีสิทธิ์เรียกใช้งาน');
    }
    return c.json({ ok: true, received: true });
  });

  return r;
}
