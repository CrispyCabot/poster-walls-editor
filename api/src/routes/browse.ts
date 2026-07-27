import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthedEnv } from '../auth.js';
import { browsePublic, previewsFor } from '../db/previews.js';
import { listProjects } from '../db/projects.js';

export interface BrowseDb {
  browsePublic: typeof browsePublic;
  previewsFor: typeof previewsFor;
  listProjects: typeof listProjects;
}

export const defaultBrowseDb: BrowseDb = { browsePublic, previewsFor, listProjects };

/** Parses a query param as a positive number, or undefined when absent/bad. */
function num(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function registerBrowseRoutes(
  app: Hono<AuthedEnv>,
  requireAuth: MiddlewareHandler,
  db: BrowseDb,
): void {
  /**
   * The signed-in user's projects, with enough data to draw a thumbnail.
   *
   * Separate from GET /projects because the preview costs one query per
   * project — callers that only need names should not pay for it.
   */
  app.get('/projects/previews', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const summaries = await db.listProjects(sub);
    const previews = await db.previewsFor(summaries.map((s) => s.id));
    // Most recently touched first, which is what a "continue where you left
    // off" row should show.
    previews.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return c.json({ projects: previews });
  });

  /**
   * Public projects. Unauthenticated on purpose — browsing for ideas should
   * not require an account, and only projects explicitly marked public are in
   * the index this reads.
   */
  app.get('/public/projects', async (c) => {
    const limit = Math.min(num(c.req.query('limit')) ?? 12, 48);
    const offset = Number(c.req.query('offset') ?? 0) || 0;

    // `exactOptionalPropertyTypes` rejects passing an explicit undefined to an
    // optional field, so absent filters are omitted rather than set to
    // undefined.
    const widthIn = num(c.req.query('widthIn'));
    const heightIn = num(c.req.query('heightIn'));
    const toleranceIn = num(c.req.query('toleranceIn'));

    const result = await db.browsePublic(
      {
        q: c.req.query('q') ?? '',
        ...(widthIn === undefined ? {} : { widthIn }),
        ...(heightIn === undefined ? {} : { heightIn }),
        ...(toleranceIn === undefined ? {} : { toleranceIn }),
      },
      limit,
      Math.max(0, offset),
    );

    return c.json(result);
  });
}
