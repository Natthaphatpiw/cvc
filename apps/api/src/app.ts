import { Hono } from 'hono';
import type { AppEnv } from './types';
import { handleError, notFound } from './lib/errors';
import { authRoutes } from './routes/auth';
import { internalRoutes } from './routes/internal';
import { libraryRoutes } from './routes/library';
import { meRoutes } from './routes/me';
import { opsRoutes } from './routes/ops';
import { refRoutes } from './routes/ref';
import { uploadRoutes } from './routes/uploads';
import { webhookRoutes } from './routes/webhooks';

/**
 * cvc-api (docs/CONTRACTS.md "apps/api"). Browser-facing routes require the edge header (requireEdge) because
 * they are reached only through the web proxy; cron, internal and webhook routes authenticate themselves (§3.5).
 */
export const app = new Hono<AppEnv>().basePath('/api');

app.route('/', opsRoutes); // GET /health, GET /cron/purge
app.route('/auth', authRoutes);
app.route('/me', meRoutes);
app.route('/uploads', uploadRoutes);
app.route('/', refRoutes); // GET /personas, GET /categories
app.route('/', libraryRoutes); // GET /history, /saved-results CRUD
app.route('/webhooks', webhookRoutes);
app.route('/internal', internalRoutes);

app.onError(handleError);
app.notFound(notFound);
