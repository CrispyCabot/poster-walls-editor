import { serve } from '@hono/node-server';
import { createApp } from './app.js';

/**
 * Runs the same Hono app the Lambda runs, on a local port.
 *
 * It talks to the REAL Cognito user pool and the REAL DynamoDB table, using
 * whatever AWS credentials are configured locally. That is deliberate: it means
 * local behaviour matches deployed behaviour exactly, including token
 * verification, rather than testing against stubs that can drift.
 *
 * WEB_ORIGIN is intentionally left unset, so CORS reflects the request origin
 * and the Vite dev server on a different port can reach it.
 */
const port = Number(process.env.PORT ?? 8787);

const required = ['TABLE_NAME', 'USER_POOL_ID', 'USER_POOL_CLIENT_ID'] as const;
const missing = required.filter((k) => (process.env[k] ?? '') === '');

if (missing.length > 0) {
  console.error(
    `Missing ${missing.join(', ')}.\n` +
      'Run `npm run dev:env` first — it reads the values from CloudFormation ' +
      'and writes .env.local.',
  );
  process.exit(1);
}

serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`api    http://localhost:${info.port}`);
});
