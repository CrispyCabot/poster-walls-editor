import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { ApiError } from './errors.js';

/**
 * Routes that throw on purpose are mounted by the test, not by createApp —
 * production must not ship endpoints whose only job is to fail. Hono's
 * onError/notFound are configuration rather than routes, so handlers
 * registered after createApp still pass through them.
 */
function appWithThrowingRoutes() {
  const app = createApp();
  app.get('/__boom', () => {
    throw new ApiError(418, 'teapot', 'short and stout');
  });
  app.get('/__throw', () => {
    throw new Error('secret internal detail');
  });
  return app;
}

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await createApp().request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('error handling', () => {
  it('returns a uniform body for unknown routes', async () => {
    const res = await createApp().request('/nope');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });

  it('maps a thrown ApiError to its status and code', async () => {
    const res = await appWithThrowingRoutes().request('/__boom');
    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'teapot', message: 'short and stout' },
    });
  });

  it('hides internal failures behind a generic 500', async () => {
    const res = await appWithThrowingRoutes().request('/__throw');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).not.toContain('secret');
  });
});

describe('CORS', () => {
  it('answers preflight with the configured origin', async () => {
    const res = await createApp().request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.test',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.test');
  });
});
