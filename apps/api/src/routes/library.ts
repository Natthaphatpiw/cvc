import { Hono } from 'hono';
import { requireEdge, requireUser } from '@cvc/auth';
import { getApiStore } from '@cvc/db';
import { SaveResultRequest, UpdateSavedRequest, type HistoryResponse, type SavedResult } from '@cvc/schemas';
import type { AppEnv } from '../types';
import { AppError, invalidRequest, pgCode } from '../lib/errors';
import { readJson } from '../lib/http';
import { ensureAppUser } from '../lib/me';

/** LINE-only: run history and saved results (§10.4). Guests keep both in IndexedDB. */
export const libraryRoutes = new Hono<AppEnv>();

libraryRoutes.use('/history', requireEdge(), requireUser({ requireLine: true }));
libraryRoutes.use('/saved-results', requireEdge(), requireUser({ requireLine: true }));
libraryRoutes.use('/saved-results/*', requireEdge(), requireUser({ requireLine: true }));

const resultNotFound = () => new AppError(404, 'result_not_found', 'ไม่พบผลวิเคราะห์นี้ในบัญชีของคุณ');
const savedNotFound = () => new AppError(404, 'saved_result_not_found', 'ไม่พบรายการที่บันทึกไว้');

/**
 * Maps store errors to API errors; rethrows anything else. Matches both raw Postgres SQLSTATEs and the
 * `code` of @cvc/db's StoreError ('not_found' | 'conflict' | 'invalid') without depending on the class.
 */
const mapSavedError = (notFound: () => AppError) => (e: unknown): never => {
  const code = pgCode(e);
  if (code === '23503' || code === 'not_found') throw notFound(); // composite FK: result missing or not owned
  if (code === '22P02' || code === 'invalid') throw notFound(); // malformed uuid
  if (code === '23505' || code === 'conflict') throw new AppError(409, 'already_saved', 'บันทึกผลวิเคราะห์นี้ไว้แล้ว');
  throw e;
};

libraryRoutes.get('/history', async (c) => {
  const cursor = c.req.query('cursor') || null;
  const rawLimit = Number(c.req.query('limit') ?? '20');
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.trunc(rawLimit))) : 20;
  const history = await getApiStore().listHistory(c.get('user').id, cursor, limit);
  return c.json<HistoryResponse>(history);
});

libraryRoutes.get('/saved-results', async (c) => {
  return c.json<SavedResult[]>(await getApiStore().listSaved(c.get('user').id));
});

libraryRoutes.post('/saved-results', ensureAppUser, async (c) => {
  const parsed = SaveResultRequest.safeParse(await readJson(c));
  if (!parsed.success) throw invalidRequest(parsed.error.issues);
  const saved = await getApiStore()
    .saveResult(c.get('user').id, parsed.data)
    .catch(mapSavedError(resultNotFound));
  return c.json<SavedResult>(saved, 201);
});

libraryRoutes.patch('/saved-results/:id', ensureAppUser, async (c) => {
  const parsed = UpdateSavedRequest.safeParse(await readJson(c));
  if (!parsed.success) throw invalidRequest(parsed.error.issues);
  const updated = await getApiStore()
    .updateSaved(c.get('user').id, c.req.param('id'), parsed.data)
    .catch(mapSavedError(savedNotFound));
  if (!updated) throw savedNotFound();
  return c.json<SavedResult>(updated);
});

libraryRoutes.delete('/saved-results/:id', async (c) => {
  const deleted = await getApiStore()
    .deleteSaved(c.get('user').id, c.req.param('id'))
    .catch(mapSavedError(savedNotFound));
  if (!deleted) throw savedNotFound();
  return c.body(null, 204);
});
