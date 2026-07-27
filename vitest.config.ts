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
          // bundling of every NodejsFunction. Each test file memoizes its
          // Template so this happens once per file rather than once per test,
          // but the first test still pays the whole cold-cache cost — measured
          // at 52s on a OneDrive-backed working copy, where every file esbuild
          // touches goes through the sync layer. CI on Linux is far quicker.
          //
          // A generous budget costs nothing when tests pass in milliseconds, and
          // the alternative is a suite that fails for environmental reasons.
          // Inline projects do not inherit root-level test options, so this must
          // be set here explicitly.
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
