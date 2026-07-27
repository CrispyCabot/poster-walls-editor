import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from './app.js';
import { ApiError } from './errors.js';

/** Shape of the uniform error body, for asserting on parsed JSON. */
interface ErrorBody {
  error: { code: string; message: string };
}

// A custom refine whose message embeds the rejected value, standing in for
// any zod schema whose issue text can end up echoing submitted data — the
// case the handler must never forward to the response body.
const bodySchema = z.object({
  secretField: z.string().superRefine((val, ctx) => {
    if (val !== 'expected') {
      ctx.addIssue({ code: 'custom', message: `rejected value: ${val}` });
    }
  }),
});

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
  app.post('/__validate', async (c) => {
    const body = await c.req.json();
    bodySchema.parse(body); // throws ZodError on a bad payload
    return c.json({ ok: true });
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
    // Without the DOM lib, `Response.json()` is typed `Promise<unknown>` by
    // undici-types rather than `Promise<any>`. Cast at the point of use — the
    // API workspace must NOT pull in DOM, which would make browser globals
    // (window, document, localStorage) type-check inside Lambda code.
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).not.toContain('secret');
  });

  it('maps a thrown ZodError to 400 without echoing the offending value', async () => {
    const res = await appWithThrowingRoutes().request('/__validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secretField: 'super-secret-value-xyz' }),
    });
    expect(res.status).toBe(400);
    const rawBody = await res.text();
    expect(rawBody).not.toContain('super-secret-value-xyz');
    const body = JSON.parse(rawBody) as ErrorBody;
    expect(body.error.code).toBe('validation_error');
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
