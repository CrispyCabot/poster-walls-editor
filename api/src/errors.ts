import type { Context } from 'hono';

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 418 | 500,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (c: Context) =>
  c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  // Never leak internal messages to the client; the details go to CloudWatch.
  console.error('unhandled error', err);
  return c.json(
    { error: { code: 'internal_error', message: 'Internal server error' } },
    500,
  );
}
