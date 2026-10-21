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

/** Which integrations are configured. Booleans only; never echo a secret value. */
export function healthRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get('/health', (c) => {
    const body: HealthResponse = {
      service: 'agent',
      ok: true,
      demo: isDemoRun(),
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
      },
    };
    c.header('cache-control', 'no-store');
    return c.json(body);
  });

  return r;
}
