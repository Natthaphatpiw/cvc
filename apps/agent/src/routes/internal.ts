import { resetChatThread } from '@cvc/ai';
import { requireOidc } from '@cvc/auth';
import { getAgentStore } from '@cvc/db';
import { ClaimRunsInternalRequest, PurgeUserRequest, type PurgeUserResponse } from '@cvc/schemas';
import { Hono } from 'hono';
import { readJson, validationFailure, type AppEnv } from '../http';
import { errorMessage } from '../lib/async';

/** Service-to-service routes; called by cvc-api with a Vercel OIDC token (§3.6). */
export function internalRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post('/internal/claim-runs', requireOidc('api'), async (c) => {
    const parsed = ClaimRunsInternalRequest.safeParse(await readJson(c));
    if (!parsed.success) throw validationFailure(parsed.error.issues);
    // The api already hashed the guest secrets; they are compared as-is with runs.claim_secret_hash.
    const { userId, items } = parsed.data;
    const claimed = items.length > 0 ? await getAgentStore().claimRuns(userId, items) : 0;
    return c.json({ claimed });
  });

  r.post('/internal/purge-user', requireOidc('api'), async (c) => {
    const parsed = PurgeUserRequest.safeParse(await readJson(c));
    if (!parsed.success) throw validationFailure(parsed.error.issues);
    const { runs, threadIds } = await getAgentStore().purgeUser(parsed.data.userId);
    let chatThreads = 0;
    for (const threadId of threadIds) {
      try {
        await resetChatThread(threadId);
        chatThreads += 1;
      } catch (err) {
        console.warn('[agent] purge-user: resetChatThread failed', threadId, errorMessage(err));
      }
    }
    const body: PurgeUserResponse = { runs, chatThreads };
    return c.json(body);
  });

  return r;
}
