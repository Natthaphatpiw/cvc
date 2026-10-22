import { AiNotConfiguredError, AiOutputError, assistForm, type AiUsage } from '@cvc/ai';
import { requireEdge, requireUser } from '@cvc/auth';
import { getAgentStore } from '@cvc/db';
import { AssistRequest, type AssistResponse } from '@cvc/schemas';
import { Hono } from 'hono';
import { ApiFailure, assertHumanGuest, currentUser, enforceRateLimit, readJson, validationFailure, type AppEnv } from '../http';

/** The planner is waiting on the form; well inside web's 120 s upstream timeout, repair turn included. */
const ASSIST_TIMEOUT_MS = 30_000;

const ASSIST_FAILED_TH = 'ยังช่วยกรอกให้ไม่ได้ กรุณาลองใหม่ หรือกรอกเองได้เลย';
const ASSIST_TIMEOUT_TH = 'ระบบใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง หรือกรอกเองได้เลย';
const ASSIST_UNAVAILABLE_TH = 'ระบบช่วยกรอกยังไม่พร้อมใช้งาน กรุณากรอกเองได้เลย';

function isTimeout(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'));
}

/** Every AI failure becomes a Thai error the form can show; none of them is a 500. */
function assistFailure(err: unknown, signal: AbortSignal): ApiFailure {
  if (err instanceof AiNotConfiguredError) return new ApiFailure(503, 'assist_unavailable', ASSIST_UNAVAILABLE_TH);
  if (isTimeout(err, signal)) return new ApiFailure(504, 'assist_timeout', ASSIST_TIMEOUT_TH);
  if (!(err instanceof AiOutputError)) console.error('[agent] assist failed', err instanceof Error ? err.message : String(err));
  return new ApiFailure(502, 'assist_failed', ASSIST_FAILED_TH);
}

export function assistRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/assist', requireEdge(), requireUser({ allowAnonymous: true }), async (c) => {
    const user = currentUser(c);
    assertHumanGuest(c, user);
    const parsed = AssistRequest.safeParse(await readJson(c));
    if (!parsed.success) throw validationFailure(parsed.error.issues);
    const req = parsed.data;
    await enforceRateLimit(`rl:assist:${user.id}`, 20, 3600);

    const personas = await getAgentStore().listPersonas();
    // Calls outside a run have no budget key; log the spend so it shows up in the function logs.
    const onUsage = (u: AiUsage) => {
      console.info(`[agent] assist ${req.section} user=${user.id} model=${u.model} in=${u.inputTokens} out=${u.outputTokens} cost=$${u.costUsd.toFixed(5)}`);
    };
    const signal = AbortSignal.timeout(ASSIST_TIMEOUT_MS);
    let body: AssistResponse;
    try {
      body = await assistForm(req, personas, { signal, onUsage });
    } catch (err) {
      throw assistFailure(err, signal);
    }
    return c.json(body);
  });

  return r;
}
