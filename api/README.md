# @pwe/api

The backend. A single [Hono](https://hono.dev) app that runs as one AWS Lambda
behind an API Gateway HTTP API.

One function serves every route — Hono does the routing internally, so there is
no Lambda-per-endpoint sprawl.

## Layout

```
src/
  app.ts       the Hono app and its routes — no Lambda coupling, so tests
               can drive it directly with app.request()
  errors.ts    ApiError plus the handler that shapes every error response
  lambda.ts    Lambda entrypoint; wraps app.ts
```

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | liveness check |

## Conventions

- Every error response is `{ error: { code, message } }`. Internal failures
  return a generic 500 — real details go to CloudWatch, never to the client.
- A project you do not own returns **404, never 403**, so the API never
  confirms that a private project exists.
- This workspace does **not** include the `DOM` lib. It runs in Node on Lambda,
  and letting `window` or `document` type-check here would hide real bugs.

## Testing

From the repo root:

```bash
npx vitest run api
```

Tests exercise the app through `app.request()` — no AWS, no network, no deploy.
