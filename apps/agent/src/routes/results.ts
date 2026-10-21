import { requireEdge, requireUser } from '@cvc/auth';
import { getAgentStore } from '@cvc/db';
import { PRESETS } from '@cvc/scoring';
import { FeedbackRequest, RescoreRequest, type RescoreResponse } from '@cvc/schemas';
import { Hono } from 'hono';
import { currentUser, loadOwnedResult, readJson, validationFailure, type AppEnv } from '../http';
import { normalizeWeights, rescoreResult } from '../lib/rescore';

export function resultRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();
  const edge = requireEdge();
  const user = requireUser({ allowAnonymous: true });

  r.get('/results/:id', edge, user, async (c) => {
    const result = await loadOwnedResult(c.req.param('id'), currentUser(c));
    c.header('cache-control', 'private, no-store');
    return c.json(result);
  });

  r.post('/results/:id/rescore', edge, user, async (c) => {
    const result = await loadOwnedResult(c.req.param('id'), currentUser(c));
    const parsed = RescoreRequest.safeParse(await readJson(c));
    if (!parsed.success) throw validationFailure(parsed.error.issues);
    const body = parsed.data;
    const preset = body.preset ?? result.methodology.preset;
    const weights = normalizeWeights(body.weights ?? PRESETS[preset]);

    const next = await rescoreResult({ result, weights, preset });
    if (!body.save) {
      const res: RescoreResponse = { result: next, saved: false };
      return c.json(res);
    }
    const saved = { ...next, version: result.version + 1, generatedAt: new Date().toISOString() };
    const version = await getAgentStore().saveResultVersion(result.resultId, saved);
    const res: RescoreResponse = { result: { ...saved, version }, saved: true };
    return c.json(res);
  });

  r.post('/results/:id/feedback', edge, user, async (c) => {
    const me = currentUser(c);
    const result = await loadOwnedResult(c.req.param('id'), me);
    const parsed = FeedbackRequest.safeParse(await readJson(c));
    if (!parsed.success) throw validationFailure(parsed.error.issues);
    await getAgentStore().saveFeedback(result.resultId, me.id, parsed.data);
    return c.body(null, 204);
  });

  return r;
}
