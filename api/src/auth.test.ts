import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

/** Shape of the uniform error body, for asserting on parsed JSON. */
interface ErrorBody {
  error: { code: string; message: string };
}

const verify = async (token: string) => {
  if (token !== 'good-token') throw new Error('bad token');
  return { sub: 'user-123', username: 'chris' };
};

const app = () => createApp({ verify });

describe('GET /me', () => {
  it('returns the caller identity for a valid token', async () => {
    const res = await app().request('/me', {
      headers: { Authorization: 'Bearer good-token' },
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sub: 'user-123', username: 'chris' });
  });

  it('rejects a missing Authorization header', async () => {
    const res = await app().request('/me');
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'unauthorized', message: 'Missing bearer token' },
    });
  });

  it('rejects a non-bearer scheme', async () => {
    const res = await app().request('/me', {
      headers: { Authorization: 'Basic abc123' },
    });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token without leaking why', async () => {
    const res = await app().request('/me', {
      headers: { Authorization: 'Bearer nope' },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toBe('Invalid token');
    expect(body.error.message).not.toContain('bad token');
  });
});

describe('unauthenticated routes', () => {
  it('leaves /health open', async () => {
    expect((await app().request('/health')).status).toBe(200);
  });
});
