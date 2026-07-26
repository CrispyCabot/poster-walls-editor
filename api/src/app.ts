import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFound } from './errors.js';

export function createApp(): Hono {
  const app = new Hono();

  // Tokens are bearer, not cookies, so a permissive reflection is safe here.
  // Task 9 narrows this to the deployed web origin via the WEB_ORIGIN env var.
  app.use('*', cors({
    origin: (origin) => process.env.WEB_ORIGIN ?? origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }));

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.notFound(notFound);
  app.onError(errorHandler);

  return app;
}
