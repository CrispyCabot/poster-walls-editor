import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { type AuthedUser, cognitoVerifier, createAuthMiddleware, type TokenVerifier } from './auth.js';
import { errorHandler, notFound } from './errors.js';

export interface AppDeps {
  /** Injected by tests; production builds the Cognito verifier lazily. */
  verify?: TokenVerifier;
}

export function createApp(deps: AppDeps = {}): Hono {
  const app = new Hono();

  // Tokens are bearer, not cookies, so a permissive reflection is safe here.
  // Task 9 narrows this to the deployed web origin via the WEB_ORIGIN env var.
  app.use('*', cors({
    origin: (origin) => process.env.WEB_ORIGIN ?? origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }));

  app.get('/health', (c) => c.json({ status: 'ok' }));

  const requireAuth = createAuthMiddleware(deps.verify ?? cognitoVerifier());

  app.get('/me', requireAuth, (c) => {
    const { sub, username } = (c as unknown as { get(k: 'user'): AuthedUser }).get('user');
    return c.json({ sub, username });
  });

  app.notFound(notFound);
  app.onError(errorHandler);

  return app;
}
