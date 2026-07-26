# Poster Walls Editor — Design

**Date:** 2026-07-26
**Status:** Approved
**Source requirements:** `REQUIREMENTS.md`

## Purpose

A web app for planning gallery walls. You enter a wall's real dimensions and the
obstructions on it, build a library of posters with their frame sizes, then drag
those posters around a to-scale view of the wall until the arrangement looks
right. The output is a printable sheet telling you exactly where to put each
nail.

The app is deployed on AWS, provisioned with CDK, and released by GitHub Actions.

## Scope

### In scope

- Cognito-backed user accounts.
- Projects containing walls, a poster pool, and saved layouts.
- Wall editor: exact dimensions in inches, with a feet/inches display toggle.
- Obstructions on the wall face: door, window, outlet, and a generic catch-all.
- Account-level poster library; posters are copied into a project's pool.
- Image upload per poster, with server-side thumbnail generation.
- Drag-and-drop arrangement with snapping, alignment guides, overlap warnings,
  live measurements, and undo/redo.
- Auto-arrange presets: grid, cluster, row.
- Multiple named layout variants per wall.
- Duplicate project and duplicate wall.
- Public/private projects plus revocable share links granting read-only access.
- Printable hang sheet (PDF) with per-poster nail coordinates.
- Custom domain at `poster-editor.chrisbridewell.dev`.

### Out of scope

Decided against during design, recorded so they are not silently reintroduced:

- Top-down floor-plan view or multi-wall room layout.
- PNG/image export of an arrangement.
- Wall background colors and scale-reference silhouettes.
- Frame cost estimation.
- Comments on shared links.
- Mobile and touch support. **The editor is desktop-first and assumes a mouse.**
- Public gallery / browsing other users' projects.
- Staging or per-PR preview environments.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Wall view | Elevation only (the wall face) | Posters hang on a wall face. One coordinate system for obstructions, placements, and hang coordinates. |
| Database | DynamoDB, single table, on-demand | Access patterns are all key lookups. Idles at ~$0. Aurora Serverless v2 has a ~$45/mo floor. |
| API compute | One Lambda running Hono | Single bundle, Hono owns routing, scales to zero, ~200ms cold start on arm64. |
| Canvas | React + SVG over a pure layout module | Inches map to SVG user units; measurements, guides, and PDF coordinates share one math implementation. |
| Auth UI | Cognito Managed Login (Hosted UI), OIDC + PKCE | No password, verification, or reset code to own. |
| Environments | Single production | Cheapest and simplest. Staging can be added later. |
| CI auth | GitHub OIDC role assumption | No long-lived AWS keys in GitHub. |
| Region | us-east-2 | User preference. |

## Architecture

```
                    poster-editor.chrisbridewell.dev
                                 │
                          ┌──────▼──────┐
                          │ CloudFront  │  ACM cert (us-east-1)
                          │   + OAC     │
                          └──┬───────┬──┘
                    default  │       │  /i/*
                    ┌────────▼─┐  ┌──▼─────────┐
                    │ S3 web   │  │ S3 images  │
                    │ (SPA)    │  │ (private)  │
                    └──────────┘  └──┬─────────┘
                                     │ ObjectCreated: uploads/*
                                  ┌──▼──────────────┐
                                  │ Lambda: sharp   │→ display.webp
                                  │ image processor │→ thumb.webp
                                  └─────────────────┘

      api.poster-editor.chrisbridewell.dev
                    │
            ┌───────▼────────┐      ┌──────────────┐
            │ API Gateway    │─────▶│ Lambda       │
            │ HTTP API       │      │ Hono monolith│
            │ (custom domain)│      │ arm64, Node22│
            └────────────────┘      └───┬───────┬──┘
                                        │       │
                              ┌─────────▼─┐  ┌──▼──────────┐
                              │ DynamoDB  │  │ S3 presign  │
                              │ single tbl│  │ (uploads)   │
                              └───────────┘  └─────────────┘

            Cognito User Pool + Managed Login  ──▶ JWT verified in Lambda
            Route53 zone: poster-editor.chrisbridewell.dev
            IAM: GitHub OIDC provider + deploy role
```

The app and the API live on separate subdomains and use CORS, rather than
routing `/api/*` through CloudFront. Auth uses bearer tokens rather than
cookies, so there is no CSRF exposure and CORS is a few lines of Hono
middleware. A separate origin keeps CloudFront's cache policy simple and makes
API traffic easier to inspect.

### Certificate regions

CloudFront accepts ACM certificates only from **us-east-1**, regardless of where
the rest of the stack lives. API Gateway regional custom domains require a
certificate in their own region. The build therefore needs two certificates:

| Certificate | Region | Consumer |
|---|---|---|
| `poster-editor.chrisbridewell.dev` | us-east-1 | CloudFront |
| `api.poster-editor.chrisbridewell.dev` | us-east-2 | API Gateway |

This is a `CertificateStack` pinned to us-east-1 plus the main stack in
us-east-2, wired together with `crossRegionReferences: true`. Route53 is global,
so one hosted zone validates both. Cognito uses its default
`.auth.us-east-2.amazoncognito.com` domain and needs no certificate.

### Estimated cost

Roughly **$1-2/month at idle**. The Route53 hosted zone is $0.50/month and
dominates; Cognito is free to 10,000 monthly active users, ACM certificates are
free, and Lambda, DynamoDB on-demand, S3, and CloudFront all round to zero at
this volume.

## Repository layout

```
poster-walls-editor/
├── app/                  React 19 + Vite SPA
├── api/                  Hono → Lambda handler
├── infrastructure/       AWS CDK v2 (TypeScript)
├── packages/
│   ├── shared/           zod schemas — the API contract, imported by app and api
│   └── layout-engine/    pure TS, zero deps: units, snapping, collision,
│                         auto-arrange, hang-sheet coordinates
├── .github/workflows/
│   ├── ci.yml            PR + push: typecheck, lint, test, build, cdk synth
│   └── deploy.yml        push to main: OIDC → cdk deploy → build → sync → invalidate
└── package.json          npm workspaces
```

Everything is TypeScript. `infrastructure`, `app`, and `api` are top-level as
required; `packages/` holds the two modules shared between them.

`layout-engine` importing neither React nor the AWS SDK is the load-bearing
structural decision. All the geometry that is easy to get wrong becomes
testable with plain unit tests, and the same functions that position a poster on
screen produce the nail coordinates on the printed sheet.

## Data model

Single DynamoDB table, on-demand billing, point-in-time recovery enabled. No
global secondary indexes — every access pattern resolves from the partition key.

```
PK                    SK                          Item
─────────────────────────────────────────────────────────────────────────
USER#<sub>            PROFILE                     display name, prefs
USER#<sub>            POSTER#<posterId>           library poster
USER#<sub>            PROJECT#<projectId>         index entry: name, updatedAt
PROJECT#<projectId>   META                        ownerId, name, visibility, version
PROJECT#<projectId>   WALL#<wallId>               name, widthIn, heightIn, obstructions[]
PROJECT#<projectId>   POSTER#<posterId>           pool entry (snapshot + libraryRef)
PROJECT#<projectId>   LAYOUT#<wallId>#<layoutId>  name, placements[]
SHARE#<token>         META                        projectId, createdAt, revoked
```

### Access patterns

| Need | Query |
|---|---|
| List my projects | `PK = USER#<sub>`, `SK begins_with PROJECT#` |
| List my poster library | `PK = USER#<sub>`, `SK begins_with POSTER#` |
| Load an entire project | `PK = PROJECT#<id>` — walls, pool, and layouts in one query |
| Resolve a share link | `PK = SHARE#<token>`, `SK = META` |
| Duplicate a project | Query the partition, rewrite every item with fresh IDs |

Obstructions embed in their wall item and placements embed in their layout item.
Both are bounded well under DynamoDB's 400KB item limit at any realistic poster
count.

### Library posters vs. project pool

A project's pool entry stores a **snapshot** of the poster's name, dimensions,
frame, and image keys, plus a `libraryPosterId` back-reference. Editing or
deleting a library poster therefore never mutates a saved arrangement or breaks
a share link already sent to someone. The library is a source to copy *from*,
not a live dependency.

The back-reference exists for provenance and for a future "update from library"
action. It is not resolved on read.

## Coordinate system

The layout engine works in **wall space: origin at the bottom-left corner of the
wall, Y increasing upward, all units in inches.** This matches how hanging is
actually described — "62 inches from the floor" — so hang-sheet numbers need no
conversion.

A single transform flips to SVG's Y-down space at render time, and that
transform is the only place the flip exists.

Placements store the **center** of the framed poster, which makes
center-alignment snapping and equal-spacing arithmetic natural. A poster's outer
footprint is `posterW + 2 × frameWidth` by `posterH + 2 × frameWidth`.

Poster defaults, per the requirements: frame width 1 inch, frame color black.
Length display defaults to inches, with a toggle to feet-and-inches.

## `layout-engine` module

```ts
snap(candidate, others, wall, opts) → { position, guides[] }
detectIssues(placements, wall, obstructions) → Issue[]   // overlap, off-wall, on-obstruction
autoArrange(posters, wall, preset) → Placement[]         // 'grid' | 'cluster' | 'row'
hangSheet(layout, wall) → HangRow[]                      // x from left, y from floor
formatLength(inches, mode) → string                      // 62" or 5' 2"
```

No React, no DOM, no AWS SDK. This is where the bulk of the unit tests live and
where every number that can be wrong gets checked headlessly.

## Editing, persistence, and conflicts

Editor state lives in a zustand store. **Undo/redo is a command stack of layout
snapshots** — layouts are small enough that snapshotting beats implementing
inverse operations for every action, and it cannot drift out of sync with
reality. Autosave is a debounced write of the affected layout item only.

Undo/redo covers **the arrangement editor only** — moving, adding, and removing
placements within a layout. Wall dimension edits, obstruction edits, and poster
library changes are ordinary forms with explicit saves and are not undoable.

A poster in the project pool is not required to be placed. Unplaced posters stay
in the pool, available to drag onto any layout of any wall in the project. A
single pool poster may be placed at most once per layout.

Every mutable item carries a `version` attribute and writes use a DynamoDB
conditional expression on it. Two tabs open on the same project cannot silently
clobber each other; the losing write is rejected and surfaced to the user.

## Error handling

Hono error middleware returns a uniform `{ error: { code, message } }` body.

| Condition | Status |
|---|---|
| zod validation failure | 400 |
| Missing or invalid JWT | 401 |
| Project not owned by caller | **404** |
| Version conflict on write | 409 |
| Unhandled | 500, logged with a request ID |

Ownership failures return 404 rather than 403 so the API never confirms that a
private project exists.

On the frontend, server state goes through TanStack Query, mutations surface
failures as toasts, and the editor is wrapped in an error boundary.

## Sharing

A project is `private` or `public`. Public projects are viewable by anyone with
the project URL; there is no gallery or discovery surface.

A private project's owner can mint a share token — an unguessable ID stored at
`SHARE#<token>` — producing a link that grants **read-only** access to anyone
who opens it, with no login required. Tokens are revocable. Only the owner can
ever edit.

Anonymous read goes through two unauthenticated API routes, which are the only
routes that skip JWT verification:

| Route | Behavior |
|---|---|
| `GET /public/projects/:id` | Returns the project only if `visibility = public`, otherwise 404 |
| `GET /shared/:token` | Resolves the token, 404 if unknown or revoked, otherwise returns its project regardless of visibility |

Both return the same read-only projection — walls, pool, and layouts, with owner
identity and share-token list stripped. Neither accepts writes.

### Known limitation: image access

Poster images are fetched directly from CloudFront by the viewer's browser, so
the API cannot gate them. Images use unguessable UUID paths, which makes the
image URL itself the secret — the same model as an unlisted document link.

**Anyone holding an exact image URL can view that image even if its project is
private.** Closing this requires CloudFront signed URLs, which adds a key pair,
a signing path in the API, and expiry handling in the frontend. Accepted for
now, recorded here so the tradeoff is deliberate.

## Image pipeline

1. Client requests a presigned PUT from the API.
2. Client uploads the original to `uploads/<uuid>/original.<ext>` in the images
   bucket.
3. S3 `ObjectCreated` on the `uploads/` prefix triggers a sharp Lambda.
4. The Lambda writes `display.webp` (1200px) and `thumb.webp` (200px) alongside.
5. The editor uses thumbnails in the poster pool and display images on the wall.

Uploads are constrained by content type and size at presign time.

## Testing

| Layer | Approach |
|---|---|
| `layout-engine` | vitest units — the highest-value tests in the repo |
| `shared` | zod schema round-trip tests |
| `api` | vitest + Hono test client, DynamoDB via `aws-sdk-client-mock` |
| `app` | vitest + Testing Library on stores and components |
| `infrastructure` | `cdk synth` snapshot test in CI |

## Deployment

`ci.yml` runs on pull requests and pushes: install, typecheck, lint, unit tests,
build all workspaces, `cdk synth`. No deployment.

`deploy.yml` runs on push to `main`. The app needs the API URL and Cognito IDs
at Vite build time, which CDK does not know until it has deployed, so the job
runs in two phases:

```
1. cdk deploy              → creates/updates infra, emits stack outputs
2. read stack outputs      → aws cloudformation describe-stacks
3. vite build              → with VITE_API_URL / VITE_COGNITO_* injected
4. s3 sync + invalidate    → SPA goes live
```

Credentials come from GitHub OIDC role assumption; no AWS keys are stored in
GitHub.

The deploy role ARN is held in the repository **secret** `AWS_DEPLOY_ROLE_ARN`,
not in workflow YAML, so the AWS account ID never appears in the public
repository. GitHub masks secrets in job logs. The role's trust policy is scoped
to this repository via the `token.actions.githubusercontent.com:sub` condition,
so the ARN alone grants nothing to anyone else.

| Name | Kind | Contents |
|---|---|---|
| `AWS_DEPLOY_ROLE_ARN` | secret | Full ARN of the OIDC deploy role |
| `AWS_REGION` | variable | `us-east-2` |

### Custom domain rollout

The custom domain sits behind a config flag, because the domain's registrar is
Namecheap and DNS has not been delegated yet.

**Phase 1 (initial).** Deploy with `useCustomDomain: false`. The app is live on
the CloudFront URL immediately. The Route53 hosted zone for
`poster-editor.chrisbridewell.dev` is created and its four nameservers appear in
the stack outputs.

**Phase 2 (cutover).** Add those four nameservers as `NS` records for host
`poster-editor` at Namecheap, then set `useCustomDomain: true` and redeploy. ACM
DNS validation succeeds automatically and the alias records are created.

The hosted zone covers `poster-editor.chrisbridewell.dev` specifically, not the
apex `chrisbridewell.dev`. Only that subdomain is delegated, so the rest of the
domain keeps resolving from Namecheap and no existing DNS changes. The registrar
stays at Namecheap; transferring it to Route53 later would require no changes to
this setup.

`.dev` is on the HSTS preload list, so HTTPS is mandatory. Everything here is
HTTPS-only regardless.

## Prerequisites and operational notes

One item needs resolving before the first deploy:

- **AWS access is currently the account root user.** Root should not be running
  deploys. Create an IAM admin user with MFA and configure the CLI against it.

`gh` is authenticated as `CrispyCabot` with `repo` and `workflow` scopes and
ADMIN permission on the target repository. The `workflow` scope matters: without
it, pushes touching `.github/workflows/` are rejected.

The target repository `https://github.com/CrispyCabot/poster-walls-editor.git`
is empty and **public**. The local repository at
`C:\Users\cbrid\OneDrive\Documents\Poster Walls Editor` was initialized fresh
and has `origin` pointing at it.

Because the repository is public, the AWS account ID is kept out of committed
files. It reaches CI through a GitHub secret, not workflow YAML.

Note that a separate git repository exists at `C:\Users\cbrid` (the user's home
directory) with no commits. It is unrelated to this project and was left
untouched.

## Build order

Each phase ends deployable and verifiable in a browser.

| Phase | Deliverable |
|---|---|
| 0 | Monorepo scaffold, `shared` + `layout-engine` skeletons, CI green |
| 1 | CDK infrastructure, first deploy on the CloudFront URL |
| 2 | Cognito auth, JWT verification, `/me` |
| 3 | Projects and walls CRUD, wall editor with obstructions |
| 4 | Poster library, presigned upload, sharp thumbnail pipeline |
| 5 | Arrangement editor: drag, snap, guides, collisions, measurements, undo/redo |
| 6 | Layout variants, auto-arrange presets |
| 7 | Sharing: public/private, share tokens, read-only viewer |
| 8 | Hang sheet PDF, generated client-side with pdf-lib |
| 9 | Custom domain cutover once Namecheap NS records are in place |
