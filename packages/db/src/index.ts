import { createMemoryAgentStore } from './agent-store.memory';
import { createPgAgentStore } from './agent-store.pg';
import { createMemoryApiStore } from './api-store.memory';
import { createPgApiStore } from './api-store.pg';
import { databaseUrl, getSql, isDbConfigured, type DbService } from './client';
import type { AgentStore, ApiStore } from './types';
import { globalSingleton } from './util';

export { isDbConfigured, getSql, type DbService } from './client';
export { inputHash } from './hash';
export { canonicalJson, sha256Hex } from './util';
export { createMemoryAgentStore } from './agent-store.memory';
export { createMemoryApiStore } from './api-store.memory';
export { createPgAgentStore, PROGRESS_STEP_KEY } from './agent-store.pg';
export { createPgApiStore } from './api-store.pg';
export { resetMemoryDb } from './memory-db';
export * from './types';

type Memo<T> = { key: string; store: T };
type StoreCache = { agent?: Memo<AgentStore>; api?: Memo<ApiStore> };

const storeCache = (): StoreCache => globalSingleton<StoreCache>('cvc.db.stores', () => ({}));

/** Memoized per process and database URL; an empty AGENT_DATABASE_URL selects the in-memory store. */
export function getAgentStore(): AgentStore {
  const cache = storeCache();
  const url = databaseUrl('agent');
  const key = url ?? 'memory';
  if (cache.agent?.key !== key) {
    cache.agent = { key, store: url ? createPgAgentStore(getSql('agent')) : createMemoryAgentStore() };
  }
  return cache.agent.store;
}

/** Memoized per process and database URL; an empty API_DATABASE_URL selects the in-memory store. */
export function getApiStore(): ApiStore {
  const cache = storeCache();
  const url = databaseUrl('api');
  const key = url ?? 'memory';
  if (cache.api?.key !== key) {
    cache.api = { key, store: url ? createPgApiStore(getSql('api')) : createMemoryApiStore() };
  }
  return cache.api.store;
}

/** True when getAgentStore()/getApiStore() would return the in-memory implementation. */
export function isMemoryStore(service: DbService): boolean {
  return !isDbConfigured(service);
}
