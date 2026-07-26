import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{packages,api,app,infrastructure}/**/*.test.{ts,tsx}'],
    environment: 'node',
    // infrastructure tests call synth(), which triggers synchronous esbuild
    // bundling of every NodejsFunction on each call. On a cold cache (every
    // GitHub Actions runner, always) this can exceed vitest's 5000ms default,
    // as seen locally on first run. 20s gives ample headroom without masking
    // a genuinely hung test.
    testTimeout: 20000,
  },
});
