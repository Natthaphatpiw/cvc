import type { MastraCompositeStore } from '@mastra/core/storage';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';

/** Mastra memory for result chat: last 20 messages of the session thread, nothing across sessions (§9.1). */
export const CHAT_MEMORY_OPTIONS = {
  lastMessages: 20,
  semanticRecall: false,
  workingMemory: { enabled: false },
  generateTitle: false,
} as const;

type MemoryCache = { key: string; memory: Promise<Memory> };
const globalCache = globalThis as typeof globalThis & { __cvcChatMemory?: MemoryCache };

const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Encrypt every non-local connection, like @cvc/db does for postgres.js ('require': TLS without pinning Supabase's
 * CA). A URL that sets its own sslmode/ssl is left to node-postgres.
 */
function sslFor(url: string): { rejectUnauthorized: false } | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { rejectUnauthorized: false };
  }
  if (parsed.searchParams.has('sslmode') || parsed.searchParams.has('ssl')) return undefined;
  return LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) ? undefined : { rejectUnauthorized: false };
}

async function createStorage(url: string): Promise<MastraCompositeStore> {
  if (!url) return new InMemoryStore({ id: 'cvc-chat-memory' });
  // Loaded lazily so the pg driver is only required when a database is configured.
  const { PostgresStore } = await import('@mastra/pg');
  const ssl = sslFor(url);
  return new PostgresStore({
    id: 'cvc-chat-memory',
    connectionString: url,
    schemaName: 'mastra',
    max: 2,
    idleTimeoutMillis: 20_000,
    ...(ssl ? { ssl } : {}),
  });
}

/**
 * Memoized (globalThis, survives Next dev HMR) Memory backed by PostgresStore (AGENT_DATABASE_URL, schema 'mastra')
 * or Mastra's InMemoryStore when no database is configured.
 */
export function getChatMemory(): Promise<Memory> {
  const url = process.env.AGENT_DATABASE_URL?.trim() ?? '';
  const key = url ? 'pg' : 'memory';
  const cached = globalCache.__cvcChatMemory;
  if (cached && cached.key === key) return cached.memory;
  const memory = createStorage(url).then((storage) => new Memory({ storage, vector: false, options: { ...CHAT_MEMORY_OPTIONS } }));
  globalCache.__cvcChatMemory = { key, memory };
  memory.catch(() => {
    if (globalCache.__cvcChatMemory?.memory === memory) globalCache.__cvcChatMemory = undefined;
  });
  return memory;
}

/** Mastra resource id of a result chat: bound to the result, not the user, so a guest → LINE claim keeps the thread. */
export function chatResourceId(resultId: string): string {
  return `result:${resultId}`;
}

/**
 * Deletes the thread and its messages. A missing thread is not an error, and a storage failure is only logged:
 * reset always continues with a new session (new thread id), so the old thread can never be read again.
 */
export async function resetChatThread(threadId: string): Promise<void> {
  try {
    const memory = await getChatMemory();
    const thread = await memory.getThreadById({ threadId });
    if (thread) await memory.deleteThread(threadId);
  } catch (err) {
    console.warn('[ai] resetChatThread: could not delete thread', threadId, err);
  }
}
