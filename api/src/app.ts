import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  type AuthedEnv,
  cognitoVerifier,
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  type TokenVerifier,
} from './auth.js';
import { errorHandler, notFound } from './errors.js';
import { type ProjectDb, defaultProjectDb, registerProjectRoutes } from './routes/projects.js';
import { type BrowseDb, defaultBrowseDb, registerBrowseRoutes } from './routes/browse.js';
import { type PosterDb, defaultPosterDb, registerPosterRoutes } from './routes/posters.js';
import { type WallDb, defaultWallDb, registerWallRoutes } from './routes/walls.js';

export interface AppDeps {
  /** Injected by tests; production builds the Cognito verifier lazily. */
  verify?: TokenVerifier;
  /** Injected by tests so routes run without AWS. */
  db?: ProjectDb;
  wallDb?: WallDb;
  posterDb?: PosterDb;
  browseDb?: BrowseDb;
}

// `AuthedEnv` types `c.get('user')` on routes behind `requireAuth`. `/health`
// is mounted on the same app and stays unauthenticated — `Variables` only
// promises `user` is present, it does not require every route to set it.
export function createApp(deps: AppDeps = {}): Hono<AuthedEnv> {
  const app = new Hono<AuthedEnv>();

  // Tokens are bearer, not cookies, so a permissive reflection is safe here.
  // WEB_ORIGIN pins this to the deployed site in production.
  app.use('*', cors({
    origin: (origin) => process.env.WEB_ORIGIN ?? origin,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }));

  app.get('/health', (c) => c.json({ status: 'ok' }));

  const verify = deps.verify ?? cognitoVerifier();
  const requireAuth = createAuthMiddleware(verify);
  const optionalAuth = createOptionalAuthMiddleware(verify);

  app.get('/me', requireAuth, (c) => {
    const { sub, username } = c.get('user');
    return c.json({ sub, username });
  });

  // Mounted before the project routes: Hono matches in registration order, so
  // /projects/previews must be declared ahead of /projects/:id or "previews"
  // gets captured as a project id.
  registerBrowseRoutes(app, requireAuth, optionalAuth, deps.browseDb ?? defaultBrowseDb);
  registerProjectRoutes(app, requireAuth, deps.db ?? defaultProjectDb);
  registerWallRoutes(app, requireAuth, deps.wallDb ?? defaultWallDb);
  registerPosterRoutes(app, requireAuth, deps.posterDb ?? defaultPosterDb);

  app.notFound(notFound);
  app.onError(errorHandler);

  return app;
}
