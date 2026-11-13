# Poster Walls Editor

Plan a gallery wall before you put holes in it. Enter a wall's real dimensions
and the things already on it (doors, windows, outlets), build a library of
posters with their frame sizes, then drag them around a to-scale view until the
arrangement looks right. The output is a printable sheet telling you exactly
where each nail goes.

Runs on AWS. React frontend, Hono API on Lambda, DynamoDB, Cognito.

## Layout

```
app/               React SPA — Cognito login via OIDC + PKCE
api/               Hono API, runs in one Lambda
infrastructure/    AWS CDK — all cloud resources
packages/
  layout-engine/   geometry and units, zero dependencies
  shared/          zod schemas shared by app and api
docs/              design spec and implementation plans
```

## Setup

Needs Node 24+.

```bash
npm install
```

## Running it locally

```bash
aws login          # the local API talks to real AWS
npm run dev:env    # writes .env.local from the deployed stack outputs
npm run dev        # api on :8787, app on :5173
```

Then open http://localhost:5173.

Local development runs against the **real** Cognito pool and the **real**
DynamoDB table, using your AWS credentials. That is deliberate — auth and
persistence then behave exactly as they do in production, rather than against
stubs that drift. `http://localhost:5173` is already a registered Cognito
callback URL, so signing in works.

Two consequences worth knowing: you are editing live data, and images load from
the deployed CloudFront distribution, because there is no local equivalent of
the `/i/*` route.

## Everyday commands

Run these from the repo root.

```bash
npm run typecheck    # type-check every workspace
npm test             # run all tests
npm run build        # build every workspace
```

## Deploying

Deployment is automatic: pushing to `main` triggers
`.github/workflows/deploy.yml`, which deploys the CDK stack, builds the SPA
against the resulting stack outputs, and publishes it.

To work with the infrastructure directly, see [infrastructure/README.md](infrastructure/README.md).

## Claude connector

The API also serves an [MCP](https://modelcontextprotocol.io) server at
`https://api.poster-editor.chrisbridewell.dev/mcp`, so Claude can read and edit
your projects, walls and posters. In Claude go to **Settings → Connectors → Add
custom connector**, paste that URL, and sign in with your Poster Walls Editor
account when asked. Leave the OAuth client fields blank: Claude registers itself.

Tools: `list_projects`, `get_project`, `create_project`, `update_project`,
`add_wall`, `update_wall`, `delete_wall`, `add_poster`, `update_poster`,
`delete_poster`, `place_poster`, `remove_poster_from_wall`,
`browse_public_projects`. Each calls the REST API in-process as the signed-in
user, so ownership checks and validation match the app. Images can only be
uploaded in the app.

Sign-in is OAuth through the shared Cognito pool, via a thin facade in
`api/src/mcp/oauth.ts` (Cognito has no dynamic client registration). The
connector has its own public, PKCE-only client, `ClaudeConnectorClient` in
`infrastructure/lib/main-stack.ts`, which only redirects to Claude's callback
URLs. Nothing about it is secret.

## Docs

- [Design spec](docs/superpowers/specs/2026-07-26-poster-walls-editor-design.md) — architecture and the decisions behind it
- [Plans](docs/superpowers/plans/) — implementation plans

## Status

Under construction. The foundation — monorepo, AWS infrastructure, and login —
is being built first; the wall editor comes after.
