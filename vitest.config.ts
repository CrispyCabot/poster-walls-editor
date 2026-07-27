import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'app',
          include: ['app/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
        },
      },
      {
        test: {
          name: 'node',
          include: ['{packages,api,infrastructure}/**/*.test.{ts,tsx}'],
          environment: 'node',
          // infrastructure tests call synth(), which triggers synchronous esbuild
          // bundling of every NodejsFunction on each call. On a cold cache (every
          // GitHub Actions runner, always) this can exceed vitest's 5000ms default,
          // as measured locally (5057ms). 20s gives ample headroom without masking
          // a genuinely hung test. Inline projects do not inherit root-level test
          // options implicitly, so this must be set here explicitly rather than
          // relying on the (now removed) root-level testTimeout.
          testTimeout: 20000,
        },
      },
    ],
  },
});
