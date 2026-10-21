import { Hono } from 'hono';
import { handleError, notFoundResponse, type AppEnv } from './http';
import { chatRoutes } from './routes/chat';
import { cronRoutes } from './routes/cron';
import { healthRoutes } from './routes/health';
import { internalRoutes } from './routes/internal';
import { resultRoutes } from './routes/results';
import { runRoutes } from './routes/runs';
import { transcribeRoutes } from './routes/transcribe';
import { webhookRoutes } from './routes/webhooks';

export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>().basePath('/api/agent');

  app.route('/', healthRoutes());
  app.route('/', transcribeRoutes());
  app.route('/', runRoutes());
  app.route('/', resultRoutes());
  app.route('/', chatRoutes());
  app.route('/', internalRoutes());
  app.route('/', cronRoutes());
  app.route('/', webhookRoutes());

  app.onError(handleError);
  app.notFound(() => notFoundResponse());
  return app;
}
