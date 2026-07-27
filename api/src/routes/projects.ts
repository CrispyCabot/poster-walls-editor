import { CreateProjectSchema, UpdateProjectSchema } from '@pwe/shared';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthedEnv } from '../auth.js';
import {
  VersionConflictError,
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  renameProject,
} from '../db/projects.js';
import { ApiError } from '../errors.js';

/** The persistence surface the routes use. Injected so tests need no AWS. */
export interface ProjectDb {
  createProject: typeof createProject;
  listProjects: typeof listProjects;
  loadProject: typeof loadProject;
  renameProject: typeof renameProject;
  deleteProject: typeof deleteProject;
}

export const defaultProjectDb: ProjectDb = {
  createProject,
  listProjects,
  loadProject,
  renameProject,
  deleteProject,
};

export function registerProjectRoutes(
  app: Hono<AuthedEnv>,
  requireAuth: MiddlewareHandler,
  db: ProjectDb,
): void {
  app.get('/projects', requireAuth, async (c) => {
    const { sub } = c.get('user');
    return c.json({ projects: await db.listProjects(sub) });
  });

  app.post('/projects', requireAuth, async (c) => {
    const { sub } = c.get('user');
    // parse throws ZodError, which errorHandler maps to 400.
    const body = CreateProjectSchema.parse(await c.req.json());
    const project = await db.createProject({
      ownerId: sub,
      name: body.name,
      visibility: body.visibility,
    });
    return c.json({ project }, 201);
  });

  app.get('/projects/:id', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const loaded = await db.loadProject(c.req.param('id'), sub);
    if (loaded === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json(loaded);
  });

  app.patch('/projects/:id', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const body = UpdateProjectSchema.parse(await c.req.json());
    try {
      const project = await db.renameProject(
        c.req.param('id'),
        sub,
        body.name,
        body.visibility,
        body.version,
      );
      return c.json({ project });
    } catch (err) {
      if (err instanceof VersionConflictError) {
        throw new ApiError(409, 'version_conflict', err.message);
      }
      throw err;
    }
  });

  app.delete('/projects/:id', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const deleted = await db.deleteProject(c.req.param('id'), sub);
    if (!deleted) throw new ApiError(404, 'not_found', 'Not found');
    return c.body(null, 204);
  });
}
