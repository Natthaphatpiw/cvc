import { Hono } from 'hono';
import { isSupabaseConfigured, requireCron } from '@cvc/auth';
import { isRedisConfigured } from '@cvc/cache';
import { getApiStore, isDbConfigured } from '@cvc/db';
import type { HealthResponse } from '@cvc/schemas';
import type { AppEnv } from '../types';
import { env, isLineLoginConfigured, isLineMessagingConfigured, isPrivateBlobConfigured } from '../lib/env';

export const opsRoutes = new Hono<AppEnv>();

/** Which integrations are configured — booleans only, never values. */
opsRoutes.get('/health', (c) => {
  const configured = {
    db: isDbConfigured('api'),
    supabase: isSupabaseConfigured(),
    lineLogin: isLineLoginConfigured(),
    lineMessaging: isLineMessagingConfigured(),
    privateBlob: isPrivateBlobConfigured(),
    redis: isRedisConfigured(),
  };
  const mode = env.demoMode();
  const core = configured.db && configured.supabase;
  c.header('Cache-Control', 'no-store');
  return c.json<HealthResponse>({
    service: 'api',
    ok: mode !== 'off' || core,
    demo: mode === 'on' || (mode === 'auto' && !core),
    configured,
  });
});

/**
 * §8.5 `app-purge` (daily 03:30 Asia/Bangkok = 20:30 UTC). The ApiStore contract exposes no retention operation
 * yet: expired shares and notifications/audit rows older than 180 days are purged in phase 2. Guest data is
 * not stored in app.* (guests have no app.users row); guest runs/results expire through the agent's retention job.
 */
opsRoutes.get('/cron/purge', requireCron(), (c) => {
  return c.json({
    job: 'app-purge',
    ranAt: new Date().toISOString(),
    store: getApiStore().kind,
    deleted: { shares: 0, notifications: 0, auditLog: 0 },
    note: 'retention of app.* runs in phase 2',
  });
});
