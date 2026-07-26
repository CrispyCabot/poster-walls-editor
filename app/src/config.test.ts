import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('reads every required value from the environment', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.test');
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://auth.test');
    vi.stubEnv('VITE_USER_POOL_CLIENT_ID', 'abc123');
    const { loadConfig } = await import('./config.js');
    expect(loadConfig('https://app.test')).toEqual({
      apiUrl: 'https://api.test',
      cognitoDomain: 'https://auth.test',
      userPoolClientId: 'abc123',
      redirectUri: 'https://app.test/callback',
    });
  });

  it('throws naming the missing variable rather than failing silently', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://auth.test');
    vi.stubEnv('VITE_USER_POOL_CLIENT_ID', 'abc123');
    const { loadConfig } = await import('./config.js');
    expect(() => loadConfig('https://app.test')).toThrow(/VITE_API_URL/);
  });

  it('strips a trailing slash from the API URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.test/');
    vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://auth.test');
    vi.stubEnv('VITE_USER_POOL_CLIENT_ID', 'abc123');
    const { loadConfig } = await import('./config.js');
    expect(loadConfig('https://app.test').apiUrl).toBe('https://api.test');
  });
});
