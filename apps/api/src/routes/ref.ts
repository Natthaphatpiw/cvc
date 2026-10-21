import { Hono } from 'hono';
import { requireEdge } from '@cvc/auth';
import { cacheGetOrSet } from '@cvc/cache';
import { getApiStore } from '@cvc/db';
import {
  PERSONAS_SEED,
  REF_SEED,
  type AudiencePersona,
  type CategoriesResponse,
  type Category,
  type PersonasResponse,
} from '@cvc/schemas';
import type { AppEnv } from '../types';

export const refRoutes = new Hono<AppEnv>();

const TTL_SEC = 3600;

/**
 * Cached for 1 h. A store failure or an empty table falls back to the static seed and is NOT cached, so the next
 * request retries the database.
 */
async function cachedOrSeed<T>(key: string, load: () => Promise<T[]>, seed: T[]): Promise<T[]> {
  try {
    return await cacheGetOrSet(key, TTL_SEC, async () => {
      const rows = await load();
      if (rows.length === 0) throw new Error(`${key}: empty`);
      return rows;
    });
  } catch (e) {
    console.warn('[api] reference data fallback to seed', key, e instanceof Error ? e.message : e);
    return seed;
  }
}

refRoutes.get('/personas', requireEdge(), async (c) => {
  const personas = await cachedOrSeed<AudiencePersona>('ref:personas:v1', () => getApiStore().listPersonas(), PERSONAS_SEED);
  c.header('Cache-Control', 'private, max-age=300');
  return c.json<PersonasResponse>({ personas });
});

refRoutes.get('/categories', requireEdge(), async (c) => {
  const categories = await cachedOrSeed<Category>('ref:categories:v1', () => getApiStore().listCategories(), REF_SEED.categories);
  c.header('Cache-Control', 'private, max-age=300');
  return c.json<CategoriesResponse>({ categories });
});
