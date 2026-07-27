import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CreatePosterSchema, PlacementsSchema } from '@pwe/shared';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthedEnv } from '../auth.js';
import {
  addPoster,
  getPlacements,
  listPosters,
  putPlacements,
  removePoster,
} from '../db/posters.js';
import { ApiError } from '../errors.js';

export interface PosterDb {
  addPoster: typeof addPoster;
  listPosters: typeof listPosters;
  removePoster: typeof removePoster;
  getPlacements: typeof getPlacements;
  putPlacements: typeof putPlacements;
}

export const defaultPosterDb: PosterDb = {
  addPoster,
  listPosters,
  removePoster,
  getPlacements,
  putPlacements,
};

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

let s3: S3Client | undefined;
function s3Client(): S3Client {
  s3 ??= new S3Client({});
  return s3;
}

export function registerPosterRoutes(
  app: Hono<AuthedEnv>,
  requireAuth: MiddlewareHandler,
  db: PosterDb,
): void {
  app.get('/projects/:id/posters', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const posters = await db.listPosters(c.req.param('id'), sub);
    if (posters === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json({ posters });
  });

  app.post('/projects/:id/posters', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const input = CreatePosterSchema.parse(await c.req.json());
    const poster = await db.addPoster(c.req.param('id'), sub, input);
    if (poster === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json({ poster }, 201);
  });

  app.delete('/projects/:id/posters/:posterId', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const removed = await db.removePoster(
      c.req.param('id'),
      sub,
      c.req.param('posterId'),
    );
    if (!removed) throw new ApiError(404, 'not_found', 'Not found');
    return c.body(null, 204);
  });

  app.get('/projects/:id/walls/:wallId/placements', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const placements = await db.getPlacements(
      c.req.param('id'),
      sub,
      c.req.param('wallId'),
    );
    if (placements === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json({ placements });
  });

  app.put('/projects/:id/walls/:wallId/placements', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const body = PlacementsSchema.parse(await c.req.json());
    const placements = await db.putPlacements(
      c.req.param('id'),
      sub,
      c.req.param('wallId'),
      body.placements,
    );
    if (placements === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json({ placements });
  });

  /**
   * Presigned PUT so the browser uploads straight to S3 — the image never goes
   * through Lambda, which has a 6MB payload ceiling and would bill for the
   * transfer twice.
   */
  app.post('/projects/:id/posters/upload-url', requireAuth, async (c) => {
    const { sub } = c.get('user');

    const body = (await c.req.json()) as { contentType?: string };
    const extension = ALLOWED_TYPES[body.contentType ?? ''];
    if (extension === undefined) {
      throw new ApiError(400, 'unsupported_type', 'Upload a PNG, JPEG, WebP, or GIF.');
    }

    // Ownership still gates this: an upload URL for a project you do not own
    // would let you consume someone else's storage.
    const posters = await db.listPosters(c.req.param('id'), sub);
    if (posters === null) throw new ApiError(404, 'not_found', 'Not found');

    const bucket = process.env.IMAGES_BUCKET;
    if (bucket === undefined || bucket === '') {
      throw new ApiError(500, 'internal_error', 'Internal server error');
    }

    // Unguessable key: the URL is the capability, as recorded in the spec.
    const imageKey = `${crypto.randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
      s3Client(),
      new PutObjectCommand({
        Bucket: bucket,
        Key: `uploads/${imageKey}`,
        ContentType: body.contentType,
      }),
      { expiresIn: 300 },
    );

    return c.json({ uploadUrl, imageKey });
  });
}
