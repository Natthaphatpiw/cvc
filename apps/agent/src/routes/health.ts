import { isAiConfigured } from '@cvc/ai';
import { isSupabaseConfigured } from '@cvc/auth';
import { isRedisConfigured } from '@cvc/cache';
import { isDbConfigured } from '@cvc/db';
import { isCreatorMediaConfigured, isPrivateBlobConfigured } from '@cvc/media';
import { isKolProviderConfigured } from '@cvc/providers';
import type { HealthResponse } from '@cvc/schemas';
import { Hono } from 'hono';
import { envFlag, isDemoRun } from '../env';
import type { AppEnv } from '../http';
import { isQueueConfigured, runnerMode, type RunnerMode } from '../pipeline/queue';

/** Which integrations are configured. Booleans only; never echo a secret value. */
export function healthRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/health', (c) => {
    // `runner` is agent-only: 'upstash' (QStash queue), 'inline' (local/demo) or 'unavailable' (runs cannot start).
    const body: HealthResponse & { runner: RunnerMode } = {
      service: 'agent',
      ok: true,
      demo: isDemoRun(),
      runner: runnerMode(),
      configured: {
        ai: isAiConfigured(),
        kolProvider: isKolProviderConfigured(),
        firecrawl: envFlag('FIRECRAWL_API_KEY'),
        apify: envFlag('APIFY_TOKEN'),
        db: isDbConfigured('agent'),
        redis: isRedisConfigured(),
        creatorMedia: isCreatorMediaConfigured(),
        privateBlob: isPrivateBlobConfigured(),
        supabase: isSupabaseConfigured(),
        queue: isQueueConfigured(),
      },
    };
    c.header('cache-control', 'no-store');
    return c.json(body);
  });

  return r;
}
