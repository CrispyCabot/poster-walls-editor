import { CreateWallSchema } from '@pwe/shared';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthedEnv } from '../auth.js';
import { addWall, removeWall, updateWall } from '../db/walls.js';
import { ApiError } from '../errors.js';

export interface WallDb {
  addWall: typeof addWall;
  updateWall: typeof updateWall;
  removeWall: typeof removeWall;
}

export const defaultWallDb: WallDb = { addWall, updateWall, removeWall };

export function registerWallRoutes(
  app: Hono<AuthedEnv>,
  requireAuth: MiddlewareHandler,
  db: WallDb,
): void {
  app.post('/projects/:id/walls', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const input = CreateWallSchema.parse(await c.req.json());
    const wall = await db.addWall(c.req.param('id'), sub, input);
    if (wall === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json({ wall }, 201);
  });

  app.put('/projects/:id/walls/:wallId', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const input = CreateWallSchema.parse(await c.req.json());
    const wall = await db.updateWall(
      c.req.param('id'),
      sub,
      c.req.param('wallId'),
      input,
    );
    if (wall === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json({ wall });
  });

  app.delete('/projects/:id/walls/:wallId', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const removed = await db.removeWall(
      c.req.param('id'),
      sub,
      c.req.param('wallId'),
    );
    if (!removed) throw new ApiError(404, 'not_found', 'Not found');
    return c.body(null, 204);
  });
}
