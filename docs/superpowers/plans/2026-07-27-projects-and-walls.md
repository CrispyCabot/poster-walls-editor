# Poster Walls Editor — Plan 2: Projects and Walls

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in, create a project, define a wall at real dimensions, place doors and windows on it, and see the whole thing drawn to scale.

**Architecture:** DynamoDB single-table access lives in small focused modules under `api/src/db/`, with pure key builders separated from I/O so the addressing scheme is unit-testable. Every project read is ownership-checked and returns 404 rather than 403; every mutation is a conditional write on a `version` attribute. The SPA talks to the API through one typed client and keeps server state in TanStack Query. The wall renders as SVG, with the inches-to-pixels transform computed by a pure function in `layout-engine`.

**Tech Stack:** Adds `@aws-sdk/client-dynamodb` 3.1095.0, `@aws-sdk/lib-dynamodb` 3.1095.0, `aws-sdk-client-mock` 4.1.0 (api); `@tanstack/react-query` 5.101.4, `@testing-library/react` 16.3.2, `@testing-library/jest-dom` 7.0.0, `@testing-library/user-event` 14.6.1 (app). Everything else is unchanged from Plan 1.

## Global Constraints

Inherited from the spec and from Plan 1's outcomes. Every task is bound by these.

- **Everything is TypeScript.** Relative imports carry `.js` extensions (ESM + bundler resolution) — this is intentional.
- **Region is `us-east-1`.** One stack, no `crossRegionReferences`.
- **The AWS account ID must never appear in any committed file** — and this must be checked against **git history**, not just the working tree. Plan 1's Definition of Done checked the working tree and missed a leak sitting in the first commit. Only `111111111111` test placeholders are allowed.
- **`packages/layout-engine` imports NOTHING** — no React, no DOM, no AWS SDK, no npm package, no Node builtin. Pure functions only.
- **All lengths are inches.** Feet-and-inches is a display format only.
- **Wall space: origin at the wall's bottom-left corner, Y increasing upward.** `toSvgY` is the ONLY Y-flip permitted anywhere.
- **Placements store the centre** of the framed poster.
- **The persisted contract states units explicitly** (`widthIn`, `xIn`, `centerXIn`); `layout-engine`'s `Rect`/`Point`/`Size` deliberately use plain geometry names. This is a boundary, not an inconsistency — see `packages/shared/README.md`.
- **Ownership failures return 404, never 403**, so the API never confirms a private project exists.
- **`api` must NOT include the `DOM` lib** (it runs on Lambda). `app` must (it runs in a browser). Where `Response.json()` types as `unknown`, cast at the point of use.
- **`npm run typecheck` is the real gate for type-level guarantees.** Vitest transpiles through esbuild and never type-checks, so `npm test` alone cannot catch a regression in the `z.input`/`z.infer` distinction.
- Custom domain stays **off** for this entire plan. That is Plan 4.

## Prerequisites

Already true, verified at the end of Plan 1:

- The app is live at `https://d12a9gq33m9h8u.cloudfront.net` with a confirmed Cognito user.
- `GET /health` returns `{"status":"ok"}`; `GET /me` returns 401 without a token and `{sub, username}` with one.
- 74 tests pass; `npm run typecheck`, `npm run build`, `cdk synth` all exit 0; CI and Deploy are green.
- The Lambda has `TABLE_NAME`, `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `WEB_ORIGIN`, `IMAGES_BUCKET` in its environment, and read/write grants on the table.
- The DynamoDB table is **empty** (0 items).

## File Structure

```
api/src/
  db/
    client.ts        DynamoDBDocumentClient singleton, reads TABLE_NAME
    keys.ts          pure key builders — no I/O, fully unit-testable
    projects.ts      project + wall persistence, ownership and version checks
  routes/
    projects.ts      /projects and /projects/:id/walls route definitions
  app.ts             mounts the routes (modified)

packages/layout-engine/src/
  viewport.ts        fitToViewport — inches-to-pixels transform, pure

app/src/
  api/
    client.ts        typed fetch wrapper, attaches the bearer token
    queries.ts       TanStack Query hooks
  routes/
    Projects.tsx     list + create
    Project.tsx      one project: its walls
    WallEditor.tsx   the to-scale SVG wall
  components/
    WallCanvas.tsx   the SVG scene itself
    ObstructionForm.tsx
  main.tsx           routes + QueryClientProvider (modified)
```

`keys.ts` and `viewport.ts` are pure and carry the highest test value. `client.ts` isolates the one place that reads `TABLE_NAME`, so tests never need it set.

---

### Task 1: DynamoDB key builders

**Files:**
- Create: `packages/shared/src/keys.ts`
- Test: `packages/shared/src/keys.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `userPk(sub: string): string` → `USER#<sub>`
  - `projectPk(projectId: string): string` → `PROJECT#<projectId>`
  - `projectIndexSk(projectId: string): string` → `PROJECT#<projectId>`
  - `wallSk(wallId: string): string` → `WALL#<wallId>`
  - `posterSk(posterId: string): string` → `POSTER#<posterId>`
  - `layoutSk(wallId: string, layoutId: string): string` → `LAYOUT#<wallId>#<layoutId>`
  - `sharePk(token: string): string` → `SHARE#<token>`
  - `META: 'META'`, `PROFILE: 'PROFILE'`
  - `PROJECT_SK_PREFIX: 'PROJECT#'`, `WALL_SK_PREFIX: 'WALL#'`, `POSTER_SK_PREFIX: 'POSTER#'`

These live in `packages/shared`, not `api`, because Plan 4's share-link work and any future admin tooling need the same addressing. They are pure string functions with no AWS dependency.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/keys.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  META,
  PROFILE,
  POSTER_SK_PREFIX,
  PROJECT_SK_PREFIX,
  WALL_SK_PREFIX,
  layoutSk,
  posterSk,
  projectIndexSk,
  projectPk,
  sharePk,
  userPk,
  wallSk,
} from './keys.js';

describe('key builders', () => {
  it('builds a user partition key', () => {
    expect(userPk('abc-123')).toBe('USER#abc-123');
  });

  it('builds a project partition key', () => {
    expect(projectPk('p1')).toBe('PROJECT#p1');
  });

  it('builds child sort keys', () => {
    expect(wallSk('w1')).toBe('WALL#w1');
    expect(posterSk('po1')).toBe('POSTER#po1');
    expect(layoutSk('w1', 'l1')).toBe('LAYOUT#w1#l1');
    expect(sharePk('tok')).toBe('SHARE#tok');
  });

  it('exposes the constant sort keys', () => {
    expect(META).toBe('META');
    expect(PROFILE).toBe('PROFILE');
  });
});

describe('prefixes', () => {
  it('are the exact prefixes of the keys they scan for', () => {
    // A begins_with query is only correct if the prefix really prefixes the
    // key. Asserting the relationship keeps the two from drifting apart.
    expect(projectIndexSk('p1').startsWith(PROJECT_SK_PREFIX)).toBe(true);
    expect(wallSk('w1').startsWith(WALL_SK_PREFIX)).toBe(true);
    expect(posterSk('po1').startsWith(POSTER_SK_PREFIX)).toBe(true);
  });

  it('does not let a wall prefix match a layout key', () => {
    // LAYOUT#<wallId>#<layoutId> must not be swept up by a WALL# scan.
    expect(layoutSk('w1', 'l1').startsWith(WALL_SK_PREFIX)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project node packages/shared/src/keys.test.ts`
Expected: FAIL — cannot resolve `./keys.js`.

- [ ] **Step 3: Implement**

`packages/shared/src/keys.ts`:

```ts
/**
 * DynamoDB key addressing for the single table.
 *
 * These live in `shared` rather than `api` because share-link resolution and
 * any future tooling address the same items. They are pure string builders —
 * nothing here touches AWS.
 *
 * Layout:
 *   USER#<sub>            PROFILE
 *   USER#<sub>            PROJECT#<projectId>          (index entry)
 *   PROJECT#<projectId>   META
 *   PROJECT#<projectId>   WALL#<wallId>
 *   PROJECT#<projectId>   POSTER#<posterId>
 *   PROJECT#<projectId>   LAYOUT#<wallId>#<layoutId>
 *   SHARE#<token>         META
 */

export const META = 'META';
export const PROFILE = 'PROFILE';

export const PROJECT_SK_PREFIX = 'PROJECT#';
export const WALL_SK_PREFIX = 'WALL#';
export const POSTER_SK_PREFIX = 'POSTER#';

export function userPk(sub: string): string {
  return `USER#${sub}`;
}

export function projectPk(projectId: string): string {
  return `PROJECT#${projectId}`;
}

/** Sort key of the per-user index entry that makes "list my projects" a query. */
export function projectIndexSk(projectId: string): string {
  return `${PROJECT_SK_PREFIX}${projectId}`;
}

export function wallSk(wallId: string): string {
  return `${WALL_SK_PREFIX}${wallId}`;
}

export function posterSk(posterId: string): string {
  return `${POSTER_SK_PREFIX}${posterId}`;
}

export function layoutSk(wallId: string, layoutId: string): string {
  return `LAYOUT#${wallId}#${layoutId}`;
}

export function sharePk(token: string): string {
  return `SHARE#${token}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project node packages/shared`
Expected: PASS — 6 new tests, 23 in `packages/shared` total.

- [ ] **Step 5: Export and commit**

Add to `packages/shared/src/index.ts`:

```ts
export * from './keys.js';
```

```bash
git add packages/shared
git commit -m "feat(shared): add DynamoDB key builders"
```

---

### Task 2: Project persistence

**Files:**
- Create: `api/src/db/client.ts`, `api/src/db/projects.ts`
- Test: `api/src/db/projects.test.ts`
- Modify: `api/package.json`

**Interfaces:**
- Consumes: key builders from Task 1; `Project`, `Wall`, `Visibility` from `@pwe/shared`.
- Produces, all from `api/src/db/projects.ts`:
  - `interface ProjectRecord { id, ownerId, name, visibility, version, createdAt, updatedAt }`
  - `createProject(input: { ownerId: string; name: string; visibility: Visibility }): Promise<ProjectRecord>`
  - `listProjects(ownerId: string): Promise<ProjectSummary[]>` where `ProjectSummary = { id, name, visibility, updatedAt }`
  - `loadProject(projectId: string, ownerId: string): Promise<{ project: ProjectRecord; walls: Wall[] } | null>` — returns `null` when absent **or** not owned, so callers cannot distinguish the two
  - `renameProject(projectId, ownerId, name, visibility, expectedVersion): Promise<ProjectRecord>`
  - `deleteProject(projectId, ownerId): Promise<boolean>`
  - `class VersionConflictError extends Error`
- Produces from `api/src/db/client.ts`: `docClient()` and `tableName()`, both lazy.

**Two design points that matter:**

Creating a project writes **two** items — the `PROJECT#<id>/META` record and the `USER#<sub>/PROJECT#<id>` index entry. They must land together or a project becomes invisible in the list while still existing. Use `TransactWriteCommand`.

`loadProject` returns `null` for both "no such project" and "not yours". That is what makes the 404-not-403 rule enforceable at the route layer — the route has no way to leak the difference.

- [ ] **Step 1: Add dependencies**

In `api/package.json`, add to `dependencies`:

```json
    "@aws-sdk/client-dynamodb": "^3.1095.0",
    "@aws-sdk/lib-dynamodb": "^3.1095.0"
```

and to `devDependencies`:

```json
    "aws-sdk-client-mock": "^4.1.0"
```

Run `npm install`.

- [ ] **Step 2: Implement the lazy client**

`api/src/db/client.ts`:

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

let cached: DynamoDBDocumentClient | undefined;

/**
 * Built on first use, not at module load. Eager construction would run in
 * every test that merely imports a route module, and would read TABLE_NAME
 * before any test had a chance to set it — the same trap that broke the
 * Cognito verifier in Plan 1.
 */
export function docClient(): DynamoDBDocumentClient {
  cached ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return cached;
}

export function tableName(): string {
  const name = process.env.TABLE_NAME;
  if (name === undefined || name === '') {
    throw new Error('TABLE_NAME is not set');
  }
  return name;
}

/** Test seam: drops the memoized client so a mock can take effect. */
export function resetDocClient(): void {
  cached = undefined;
}
```

- [ ] **Step 3: Write the failing tests**

`api/src/db/projects.test.ts`:

```ts
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDocClient } from './client.js';
import {
  VersionConflictError,
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  renameProject,
} from './projects.js';

const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddb.reset();
  resetDocClient();
  process.env.TABLE_NAME = 'test-table';
});

afterEach(() => {
  delete process.env.TABLE_NAME;
});

describe('createProject', () => {
  it('writes the project and its user index entry in one transaction', async () => {
    ddb.on(TransactWriteCommand).resolves({});

    const project = await createProject({
      ownerId: 'user-1',
      name: 'Living Room',
      visibility: 'private',
    });

    expect(project.name).toBe('Living Room');
    expect(project.version).toBe(1);
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);

    const calls = ddb.commandCalls(TransactWriteCommand);
    expect(calls).toHaveLength(1);

    const items = calls[0]?.args[0].input.TransactItems ?? [];
    expect(items).toHaveLength(2);

    // Both items must land together, or the project exists but never appears
    // in the owner's list.
    const keys = items.map((i) => `${i.Put?.Item?.PK}|${i.Put?.Item?.SK}`);
    expect(keys).toContain(`PROJECT#${project.id}|META`);
    expect(keys).toContain(`USER#user-1|PROJECT#${project.id}`);
  });
});

describe('listProjects', () => {
  it('queries the user partition for project index entries', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { PK: 'USER#user-1', SK: 'PROJECT#p1', id: 'p1', name: 'A', visibility: 'private', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });

    const projects = await listProjects('user-1');

    expect(projects).toEqual([
      { id: 'p1', name: 'A', visibility: 'private', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const input = ddb.commandCalls(QueryCommand)[0]?.args[0].input;
    expect(input?.ExpressionAttributeValues?.[':pk']).toBe('USER#user-1');
    expect(input?.ExpressionAttributeValues?.[':sk']).toBe('PROJECT#');
  });

  it('returns an empty array when the user has none', async () => {
    ddb.on(QueryCommand).resolves({});
    await expect(listProjects('user-1')).resolves.toEqual([]);
  });
});

describe('loadProject', () => {
  const meta = {
    PK: 'PROJECT#p1', SK: 'META', id: 'p1', ownerId: 'user-1',
    name: 'A', visibility: 'private', version: 3,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('returns the project and its walls from one query', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        meta,
        { PK: 'PROJECT#p1', SK: 'WALL#w1', id: 'w1', name: 'North', widthIn: 144, heightIn: 96, obstructions: [] },
      ],
    });

    const loaded = await loadProject('p1', 'user-1');

    expect(loaded?.project.id).toBe('p1');
    expect(loaded?.walls).toHaveLength(1);
    expect(loaded?.walls[0]?.name).toBe('North');
  });

  it('returns null when the project does not exist', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });
    await expect(loadProject('p1', 'user-1')).resolves.toBeNull();
  });

  it('returns null — not a distinguishable error — when someone else owns it', async () => {
    // This is what lets the route layer answer 404 without ever being able to
    // leak that a private project exists.
    ddb.on(QueryCommand).resolves({ Items: [{ ...meta, ownerId: 'someone-else' }] });
    await expect(loadProject('p1', 'user-1')).resolves.toBeNull();
  });
});

describe('renameProject', () => {
  it('writes conditionally on the expected version and bumps it', async () => {
    ddb.on(UpdateCommand).resolves({
      Attributes: { ...{ id: 'p1', ownerId: 'user-1', name: 'B', visibility: 'public', version: 4 } },
    });

    const updated = await renameProject('p1', 'user-1', 'B', 'public', 3);

    expect(updated.version).toBe(4);

    const input = ddb.commandCalls(UpdateCommand)[0]?.args[0].input;
    expect(input?.ConditionExpression).toContain('version = :expected');
    expect(input?.ConditionExpression).toContain('ownerId = :ownerId');
    expect(input?.ExpressionAttributeValues?.[':expected']).toBe(3);
  });

  it('raises VersionConflictError when the condition fails', async () => {
    const err = new Error('conditional request failed');
    err.name = 'ConditionalCheckFailedException';
    ddb.on(UpdateCommand).rejects(err);

    await expect(renameProject('p1', 'user-1', 'B', 'public', 3))
      .rejects.toBeInstanceOf(VersionConflictError);
  });
});

describe('deleteProject', () => {
  it('removes every item in the partition plus the index entry', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { PK: 'PROJECT#p1', SK: 'META', ownerId: 'user-1' },
        { PK: 'PROJECT#p1', SK: 'WALL#w1' },
      ],
    });
    ddb.on(DeleteCommand).resolves({});

    await expect(deleteProject('p1', 'user-1')).resolves.toBe(true);

    const deleted = ddb.commandCalls(DeleteCommand)
      .map((c) => `${c.args[0].input.Key?.PK}|${c.args[0].input.Key?.SK}`);
    expect(deleted).toContain('PROJECT#p1|META');
    expect(deleted).toContain('PROJECT#p1|WALL#w1');
    expect(deleted).toContain('USER#user-1|PROJECT#p1');
  });

  it('returns false and deletes nothing when not owned', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ PK: 'PROJECT#p1', SK: 'META', ownerId: 'someone-else' }],
    });

    await expect(deleteProject('p1', 'user-1')).resolves.toBe(false);
    expect(ddb.commandCalls(DeleteCommand)).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run --project node api/src/db`
Expected: FAIL — cannot resolve `./projects.js`.

- [ ] **Step 5: Implement**

`api/src/db/projects.ts`:

```ts
import {
  DeleteCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  META,
  PROJECT_SK_PREFIX,
  type Visibility,
  type Wall,
  WALL_SK_PREFIX,
  projectIndexSk,
  projectPk,
  userPk,
} from '@pwe/shared';
import { docClient, tableName } from './client.js';

export interface ProjectRecord {
  id: string;
  ownerId: string;
  name: string;
  visibility: Visibility;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  visibility: Visibility;
  updatedAt: string;
}

/** Raised when a conditional write loses — another writer got there first. */
export class VersionConflictError extends Error {
  constructor() {
    super('The project was modified by someone else');
    this.name = 'VersionConflictError';
  }
}

export async function createProject(input: {
  ownerId: string;
  name: string;
  visibility: Visibility;
}): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    id: crypto.randomUUID(),
    ownerId: input.ownerId,
    name: input.name,
    visibility: input.visibility,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  // One transaction, because a project whose index entry is missing exists but
  // never appears in its owner's list.
  await docClient().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName(),
            Item: { PK: projectPk(project.id), SK: META, ...project },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: tableName(),
            Item: {
              PK: userPk(input.ownerId),
              SK: projectIndexSk(project.id),
              id: project.id,
              name: project.name,
              visibility: project.visibility,
              updatedAt: now,
            },
          },
        },
      ],
    }),
  );

  return project;
}

export async function listProjects(ownerId: string): Promise<ProjectSummary[]> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': userPk(ownerId),
        ':sk': PROJECT_SK_PREFIX,
      },
    }),
  );

  return (result.Items ?? []).map((item) => ({
    id: String(item.id),
    name: String(item.name),
    visibility: item.visibility as Visibility,
    updatedAt: String(item.updatedAt),
  }));
}

/**
 * Returns null both when the project is absent and when it belongs to someone
 * else. Callers therefore cannot tell the two apart, which is what keeps the
 * 404-never-403 rule honest.
 */
export async function loadProject(
  projectId: string,
  ownerId: string,
): Promise<{ project: ProjectRecord; walls: Wall[] } | null> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': projectPk(projectId) },
    }),
  );

  const items = result.Items ?? [];
  const meta = items.find((i) => i.SK === META);
  if (meta === undefined || meta.ownerId !== ownerId) return null;

  const walls: Wall[] = items
    .filter((i) => String(i.SK).startsWith(WALL_SK_PREFIX))
    .map((i) => ({
      id: String(i.id),
      name: String(i.name),
      widthIn: Number(i.widthIn),
      heightIn: Number(i.heightIn),
      obstructions: (i.obstructions ?? []) as Wall['obstructions'],
    }));

  return {
    project: {
      id: String(meta.id),
      ownerId: String(meta.ownerId),
      name: String(meta.name),
      visibility: meta.visibility as Visibility,
      version: Number(meta.version),
      createdAt: String(meta.createdAt),
      updatedAt: String(meta.updatedAt),
    },
    walls,
  };
}

export async function renameProject(
  projectId: string,
  ownerId: string,
  name: string,
  visibility: Visibility,
  expectedVersion: number,
): Promise<ProjectRecord> {
  const now = new Date().toISOString();

  try {
    const result = await docClient().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { PK: projectPk(projectId), SK: META },
        UpdateExpression:
          'SET #name = :name, visibility = :visibility, updatedAt = :now, version = :next',
        // Ownership is part of the condition, so a non-owner's write fails the
        // same way a stale write does — no separate read, no timing signal.
        ConditionExpression: 'version = :expected AND ownerId = :ownerId',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: {
          ':name': name,
          ':visibility': visibility,
          ':now': now,
          ':next': expectedVersion + 1,
          ':expected': expectedVersion,
          ':ownerId': ownerId,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    const a = result.Attributes ?? {};
    return {
      id: String(a.id),
      ownerId: String(a.ownerId),
      name: String(a.name),
      visibility: a.visibility as Visibility,
      version: Number(a.version),
      createdAt: String(a.createdAt),
      updatedAt: String(a.updatedAt),
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      throw new VersionConflictError();
    }
    throw err;
  }
}

export async function deleteProject(
  projectId: string,
  ownerId: string,
): Promise<boolean> {
  const result = await docClient().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': projectPk(projectId) },
    }),
  );

  const items = result.Items ?? [];
  const meta = items.find((i) => i.SK === META);
  if (meta === undefined || meta.ownerId !== ownerId) return false;

  for (const item of items) {
    await docClient().send(
      new DeleteCommand({
        TableName: tableName(),
        Key: { PK: item.PK, SK: item.SK },
      }),
    );
  }

  await docClient().send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { PK: userPk(ownerId), SK: projectIndexSk(projectId) },
    }),
  );

  return true;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run --project node api`
Expected: PASS — 10 new tests, 22 in `api` total.

- [ ] **Step 7: Commit**

```bash
git add api packages
git commit -m "feat(api): add project persistence with ownership and version checks"
```

---

### Task 3: Projects API routes

**Files:**
- Create: `api/src/routes/projects.ts`
- Test: `api/src/routes/projects.test.ts`
- Modify: `api/src/app.ts`, `packages/shared/src/schemas.ts`, `api/README.md`

**Interfaces:**
- Consumes: everything from Task 2; `createAuthMiddleware`, `AuthedEnv`, `TokenVerifier` from `api/src/auth.ts`.
- Produces:
  - `registerProjectRoutes(app: Hono<AuthedEnv>, requireAuth: MiddlewareHandler): void`
  - Routes: `GET /projects`, `POST /projects`, `GET /projects/:id`, `PATCH /projects/:id`, `DELETE /projects/:id`
  - `UpdateProjectSchema` in `@pwe/shared` — `{ name, visibility, version }`
- Modifies `createApp` to accept an optional `db` seam so route tests can run without AWS.

**Status codes:** 200 on success, 201 on create, 400 on validation failure, 401 unauthenticated, **404 for both missing and not-owned**, 409 on version conflict.

- [ ] **Step 1: Add the update schema**

Append to `packages/shared/src/schemas.ts`:

```ts
export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  visibility: VisibilitySchema,
  /** The version the client last read. A mismatch means someone else wrote. */
  version: z.number().int().nonnegative(),
});
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;
```

No `*Input` alias is needed — this schema has no `.default()` fields.

- [ ] **Step 2: Write the failing tests**

`api/src/routes/projects.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { VersionConflictError } from '../db/projects.js';

interface ErrorBody {
  error: { code: string; message: string };
}

const verify = async (token: string) => {
  if (token !== 'good') throw new Error('bad token');
  return { sub: 'user-1', username: 'chris' };
};

const auth = { Authorization: 'Bearer good' };

function appWith(db: Partial<Parameters<typeof createApp>[0]['db']>) {
  return createApp({ verify, db: db as never });
}

describe('GET /projects', () => {
  it('returns the caller’s projects', async () => {
    const listProjects = vi.fn().mockResolvedValue([
      { id: 'p1', name: 'A', visibility: 'private', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const res = await appWith({ listProjects }).request('/projects', { headers: auth });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      projects: [{ id: 'p1', name: 'A', visibility: 'private', updatedAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(listProjects).toHaveBeenCalledWith('user-1');
  });

  it('requires a token', async () => {
    const res = await appWith({}).request('/projects');
    expect(res.status).toBe(401);
  });
});

describe('POST /projects', () => {
  it('creates a project and defaults visibility to private', async () => {
    const createProject = vi.fn().mockResolvedValue({
      id: 'p1', ownerId: 'user-1', name: 'Living Room', visibility: 'private',
      version: 1, createdAt: 'x', updatedAt: 'x',
    });

    const res = await appWith({ createProject }).request('/projects', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Living Room' }),
    });

    expect(res.status).toBe(201);
    expect(createProject).toHaveBeenCalledWith({
      ownerId: 'user-1', name: 'Living Room', visibility: 'private',
    });
  });

  it('rejects an empty name with 400, not 500', async () => {
    const res = await appWith({ createProject: vi.fn() }).request('/projects', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('validation_error');
  });
});

describe('GET /projects/:id', () => {
  it('returns the project with its walls', async () => {
    const loadProject = vi.fn().mockResolvedValue({
      project: { id: 'p1', ownerId: 'user-1', name: 'A', visibility: 'private', version: 1, createdAt: 'x', updatedAt: 'x' },
      walls: [{ id: 'w1', name: 'North', widthIn: 144, heightIn: 96, obstructions: [] }],
    });

    const res = await appWith({ loadProject }).request('/projects/p1', { headers: auth });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { project: { id: string }; walls: unknown[] };
    expect(body.project.id).toBe('p1');
    expect(body.walls).toHaveLength(1);
  });

  it('returns 404 — not 403 — for a project owned by someone else', async () => {
    // loadProject returns null for both "absent" and "not yours", so the route
    // has no way to leak which it was.
    const loadProject = vi.fn().mockResolvedValue(null);

    const res = await appWith({ loadProject }).request('/projects/p1', { headers: auth });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('not_found');
    expect(JSON.stringify(body)).not.toContain('forbidden');
  });
});

describe('PATCH /projects/:id', () => {
  it('returns 409 when the version is stale', async () => {
    const renameProject = vi.fn().mockRejectedValue(new VersionConflictError());

    const res = await appWith({ renameProject }).request('/projects/p1', {
      method: 'PATCH',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'B', visibility: 'public', version: 1 }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('version_conflict');
  });
});

describe('DELETE /projects/:id', () => {
  it('returns 204 when it deleted something', async () => {
    const deleteProject = vi.fn().mockResolvedValue(true);
    const res = await appWith({ deleteProject }).request('/projects/p1', {
      method: 'DELETE', headers: auth,
    });
    expect(res.status).toBe(204);
  });

  it('returns 404 when it deleted nothing', async () => {
    const deleteProject = vi.fn().mockResolvedValue(false);
    const res = await appWith({ deleteProject }).request('/projects/p1', {
      method: 'DELETE', headers: auth,
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project node api/src/routes`
Expected: FAIL — `createApp` does not accept `db`.

- [ ] **Step 4: Implement the routes**

`api/src/routes/projects.ts`:

```ts
import { CreateProjectSchema, UpdateProjectSchema } from '@pwe/shared';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthedEnv } from '../auth.js';
import { ApiError } from '../errors.js';
import {
  VersionConflictError,
  createProject,
  deleteProject,
  listProjects,
  loadProject,
  renameProject,
} from '../db/projects.js';

/** The persistence surface the routes use. Injected so tests need no AWS. */
export interface ProjectDb {
  createProject: typeof createProject;
  listProjects: typeof listProjects;
  loadProject: typeof loadProject;
  renameProject: typeof renameProject;
  deleteProject: typeof deleteProject;
}

export const defaultProjectDb: ProjectDb = {
  createProject,
  listProjects,
  loadProject,
  renameProject,
  deleteProject,
};

export function registerProjectRoutes(
  app: Hono<AuthedEnv>,
  requireAuth: MiddlewareHandler,
  db: ProjectDb,
): void {
  app.get('/projects', requireAuth, async (c) => {
    const { sub } = c.get('user');
    return c.json({ projects: await db.listProjects(sub) });
  });

  app.post('/projects', requireAuth, async (c) => {
    const { sub } = c.get('user');
    // parse throws ZodError, which errorHandler maps to 400.
    const body = CreateProjectSchema.parse(await c.req.json());
    const project = await db.createProject({
      ownerId: sub,
      name: body.name,
      visibility: body.visibility,
    });
    return c.json({ project }, 201);
  });

  app.get('/projects/:id', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const loaded = await db.loadProject(c.req.param('id'), sub);
    if (loaded === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json(loaded);
  });

  app.patch('/projects/:id', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const body = UpdateProjectSchema.parse(await c.req.json());
    try {
      const project = await db.renameProject(
        c.req.param('id'), sub, body.name, body.visibility, body.version,
      );
      return c.json({ project });
    } catch (err) {
      if (err instanceof VersionConflictError) {
        throw new ApiError(409, 'version_conflict', err.message);
      }
      throw err;
    }
  });

  app.delete('/projects/:id', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const deleted = await db.deleteProject(c.req.param('id'), sub);
    if (!deleted) throw new ApiError(404, 'not_found', 'Not found');
    return c.body(null, 204);
  });
}
```

- [ ] **Step 5: Wire it into the app**

In `api/src/app.ts`, extend `AppDeps` and mount the routes. Add to the imports:

```ts
import { type ProjectDb, defaultProjectDb, registerProjectRoutes } from './routes/projects.js';
```

Change `AppDeps` to:

```ts
export interface AppDeps {
  /** Injected by tests; production builds the Cognito verifier lazily. */
  verify?: TokenVerifier;
  /** Injected by tests so routes run without AWS. */
  db?: ProjectDb;
}
```

Then, after the `/me` route and before `app.notFound(...)`, add:

```ts
  registerProjectRoutes(app, requireAuth, deps.db ?? defaultProjectDb);
```

Note `ApiError`'s status union in `api/src/errors.ts` must include `409`. It currently lists `400 | 401 | 404 | 409 | 418 | 500` — confirm `409` is present and leave the rest alone.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run --project node api`
Expected: PASS — 8 new tests, 30 in `api` total.

- [ ] **Step 7: Update the README and commit**

In `api/README.md`, extend the Routes table:

```markdown
| `GET /projects` | Cognito access token | list the caller's projects |
| `POST /projects` | Cognito access token | create a project |
| `GET /projects/:id` | Cognito access token | project plus its walls |
| `PATCH /projects/:id` | Cognito access token | rename / change visibility |
| `DELETE /projects/:id` | Cognito access token | delete a project and its children |
```

```bash
git add api packages
git commit -m "feat(api): add projects CRUD routes"
```

---

### Task 4: Walls API routes

**Files:**
- Create: `api/src/db/walls.ts`, `api/src/routes/walls.ts`
- Test: `api/src/db/walls.test.ts`, `api/src/routes/walls.test.ts`
- Modify: `api/src/app.ts`, `packages/shared/src/schemas.ts`, `api/README.md`

**Interfaces:**
- Consumes: `docClient`, `tableName` from Task 2; key builders from Task 1.
- Produces from `api/src/db/walls.ts`:
  - `addWall(projectId, ownerId, wall: WallInput): Promise<Wall | null>` — `null` when the project is absent or not owned
  - `updateWall(projectId, ownerId, wallId, wall: WallInput): Promise<Wall | null>`
  - `removeWall(projectId, ownerId, wallId): Promise<boolean>`
- Produces from `api/src/routes/walls.ts`: `registerWallRoutes(app, requireAuth, db)` and `WallDb`.
- Adds `CreateWallSchema` to `@pwe/shared` — `WallSchema` without `id`, since the server assigns it.

Every wall mutation must verify project ownership first. A wall write that skipped that check would let anyone append walls to any project by guessing an id.

- [ ] **Step 1: Add the create schema**

Append to `packages/shared/src/schemas.ts`:

```ts
/** Wall as submitted by a client; the server assigns the id. */
export const CreateWallSchema = WallSchema.omit({ id: true });
export type CreateWall = z.infer<typeof CreateWallSchema>;
export type CreateWallInput = z.input<typeof CreateWallSchema>;
```

`CreateWallInput` is needed because `obstructions` carries a `.default([])` — without the input alias, a client could not omit it. This is the same trap documented in `packages/shared/README.md`.

- [ ] **Step 2: Write the failing persistence tests**

`api/src/db/walls.test.ts`:

```ts
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetDocClient } from './client.js';
import { addWall, removeWall, updateWall } from './walls.js';

const ddb = mockClient(DynamoDBDocumentClient);

const ownedMeta = {
  Item: { PK: 'PROJECT#p1', SK: 'META', ownerId: 'user-1' },
};

beforeEach(() => {
  ddb.reset();
  resetDocClient();
  process.env.TABLE_NAME = 'test-table';
});

afterEach(() => {
  delete process.env.TABLE_NAME;
});

describe('addWall', () => {
  it('assigns an id and writes the wall under the project partition', async () => {
    ddb.on(GetCommand).resolves(ownedMeta);
    ddb.on(PutCommand).resolves({});

    const wall = await addWall('p1', 'user-1', {
      name: 'North', widthIn: 144, heightIn: 96, obstructions: [],
    });

    expect(wall?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(wall?.name).toBe('North');

    const item = ddb.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(item?.PK).toBe('PROJECT#p1');
    expect(String(item?.SK)).toBe(`WALL#${wall?.id}`);
  });

  it('returns null and writes nothing when the project is not owned', async () => {
    // Without this check anyone could append walls to any project id.
    ddb.on(GetCommand).resolves({ Item: { PK: 'PROJECT#p1', SK: 'META', ownerId: 'other' } });

    await expect(addWall('p1', 'user-1', {
      name: 'North', widthIn: 144, heightIn: 96, obstructions: [],
    })).resolves.toBeNull();

    expect(ddb.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('returns null when the project does not exist', async () => {
    ddb.on(GetCommand).resolves({});
    await expect(addWall('p1', 'user-1', {
      name: 'North', widthIn: 144, heightIn: 96, obstructions: [],
    })).resolves.toBeNull();
  });
});

describe('updateWall', () => {
  it('overwrites the wall, preserving its id', async () => {
    ddb.on(GetCommand).resolves(ownedMeta);
    ddb.on(PutCommand).resolves({});

    const wall = await updateWall('p1', 'user-1', 'w1', {
      name: 'South', widthIn: 120, heightIn: 96, obstructions: [],
    });

    expect(wall?.id).toBe('w1');
    expect(wall?.name).toBe('South');
  });
});

describe('removeWall', () => {
  it('refuses when the project is not owned', async () => {
    ddb.on(GetCommand).resolves({ Item: { PK: 'PROJECT#p1', SK: 'META', ownerId: 'other' } });
    await expect(removeWall('p1', 'user-1', 'w1')).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run --project node api/src/db/walls.test.ts`
Expected: FAIL — cannot resolve `./walls.js`.

- [ ] **Step 4: Implement persistence**

`api/src/db/walls.ts`:

```ts
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { META, type CreateWall, type Wall, projectPk, wallSk } from '@pwe/shared';
import { docClient, tableName } from './client.js';

/**
 * Every wall mutation goes through this first. Skipping it would let anyone
 * append walls to any project by guessing its id.
 */
async function ownsProject(projectId: string, ownerId: string): Promise<boolean> {
  const result = await docClient().send(
    new GetCommand({
      TableName: tableName(),
      Key: { PK: projectPk(projectId), SK: META },
    }),
  );
  return result.Item !== undefined && result.Item.ownerId === ownerId;
}

export async function addWall(
  projectId: string,
  ownerId: string,
  input: CreateWall,
): Promise<Wall | null> {
  if (!(await ownsProject(projectId, ownerId))) return null;

  const wall: Wall = { id: crypto.randomUUID(), ...input };

  await docClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: { PK: projectPk(projectId), SK: wallSk(wall.id), ...wall },
    }),
  );

  return wall;
}

export async function updateWall(
  projectId: string,
  ownerId: string,
  wallId: string,
  input: CreateWall,
): Promise<Wall | null> {
  if (!(await ownsProject(projectId, ownerId))) return null;

  const wall: Wall = { id: wallId, ...input };

  await docClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: { PK: projectPk(projectId), SK: wallSk(wallId), ...wall },
    }),
  );

  return wall;
}

export async function removeWall(
  projectId: string,
  ownerId: string,
  wallId: string,
): Promise<boolean> {
  if (!(await ownsProject(projectId, ownerId))) return false;

  await docClient().send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { PK: projectPk(projectId), SK: wallSk(wallId) },
    }),
  );

  return true;
}
```

- [ ] **Step 5: Write the failing route tests**

`api/src/routes/walls.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

interface ErrorBody {
  error: { code: string; message: string };
}

const verify = async (token: string) => {
  if (token !== 'good') throw new Error('bad token');
  return { sub: 'user-1', username: 'chris' };
};

const auth = { Authorization: 'Bearer good', 'Content-Type': 'application/json' };

const body = JSON.stringify({ name: 'North', widthIn: 144, heightIn: 96 });

describe('POST /projects/:id/walls', () => {
  it('creates a wall and defaults obstructions to an empty array', async () => {
    const addWall = vi.fn().mockResolvedValue({
      id: 'w1', name: 'North', widthIn: 144, heightIn: 96, obstructions: [],
    });

    const res = await createApp({ verify, wallDb: { addWall } as never })
      .request('/projects/p1/walls', { method: 'POST', headers: auth, body });

    expect(res.status).toBe(201);
    expect(addWall).toHaveBeenCalledWith('p1', 'user-1', {
      name: 'North', widthIn: 144, heightIn: 96, obstructions: [],
    });
  });

  it('returns 404 when the project is not the caller’s', async () => {
    const addWall = vi.fn().mockResolvedValue(null);

    const res = await createApp({ verify, wallDb: { addWall } as never })
      .request('/projects/p1/walls', { method: 'POST', headers: auth, body });

    expect(res.status).toBe(404);
    const parsed = (await res.json()) as ErrorBody;
    expect(parsed.error.code).toBe('not_found');
  });

  it('rejects a zero-width wall with 400', async () => {
    const res = await createApp({ verify, wallDb: { addWall: vi.fn() } as never })
      .request('/projects/p1/walls', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ name: 'North', widthIn: 0, heightIn: 96 }),
      });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /projects/:id/walls/:wallId', () => {
  it('returns 204 on success and 404 when nothing was removed', async () => {
    const ok = await createApp({ verify, wallDb: { removeWall: vi.fn().mockResolvedValue(true) } as never })
      .request('/projects/p1/walls/w1', { method: 'DELETE', headers: auth });
    expect(ok.status).toBe(204);

    const missing = await createApp({ verify, wallDb: { removeWall: vi.fn().mockResolvedValue(false) } as never })
      .request('/projects/p1/walls/w1', { method: 'DELETE', headers: auth });
    expect(missing.status).toBe(404);
  });
});
```

- [ ] **Step 6: Implement the routes**

`api/src/routes/walls.ts`:

```ts
import { CreateWallSchema } from '@pwe/shared';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthedEnv } from '../auth.js';
import { ApiError } from '../errors.js';
import { addWall, removeWall, updateWall } from '../db/walls.js';

export interface WallDb {
  addWall: typeof addWall;
  updateWall: typeof updateWall;
  removeWall: typeof removeWall;
}

export const defaultWallDb: WallDb = { addWall, updateWall, removeWall };

export function registerWallRoutes(
  app: Hono<AuthedEnv>,
  requireAuth: MiddlewareHandler,
  db: WallDb,
): void {
  app.post('/projects/:id/walls', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const input = CreateWallSchema.parse(await c.req.json());
    const wall = await db.addWall(c.req.param('id'), sub, input);
    if (wall === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json({ wall }, 201);
  });

  app.put('/projects/:id/walls/:wallId', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const input = CreateWallSchema.parse(await c.req.json());
    const wall = await db.updateWall(c.req.param('id'), sub, c.req.param('wallId'), input);
    if (wall === null) throw new ApiError(404, 'not_found', 'Not found');
    return c.json({ wall });
  });

  app.delete('/projects/:id/walls/:wallId', requireAuth, async (c) => {
    const { sub } = c.get('user');
    const removed = await db.removeWall(c.req.param('id'), sub, c.req.param('wallId'));
    if (!removed) throw new ApiError(404, 'not_found', 'Not found');
    return c.body(null, 204);
  });
}
```

- [ ] **Step 7: Wire into the app**

In `api/src/app.ts`, add `wallDb?: WallDb` to `AppDeps`, import `registerWallRoutes`/`defaultWallDb`/`WallDb`, and add after the project routes:

```ts
  registerWallRoutes(app, requireAuth, deps.wallDb ?? defaultWallDb);
```

- [ ] **Step 8: Run tests, update README, commit**

Run: `npx vitest run --project node api`
Expected: PASS — 9 new tests, 39 in `api` total.

Add to `api/README.md`'s Routes table:

```markdown
| `POST /projects/:id/walls` | Cognito access token | add a wall |
| `PUT /projects/:id/walls/:wallId` | Cognito access token | replace a wall |
| `DELETE /projects/:id/walls/:wallId` | Cognito access token | remove a wall |
```

```bash
git add api packages
git commit -m "feat(api): add wall CRUD routes with project ownership checks"
```

---

### Task 5: Viewport transform in `layout-engine`

**Files:**
- Create: `packages/layout-engine/src/viewport.ts`
- Test: `packages/layout-engine/src/viewport.test.ts`
- Modify: `packages/layout-engine/src/index.ts`, `packages/layout-engine/README.md`

**Interfaces:**
- Consumes: `Rect`, `Size` from `geometry.ts`.
- Produces:
  - `interface Viewport { width: number; height: number; padding: number }` — pixels
  - `interface Fit { scale: number; offsetX: number; offsetY: number }` — `scale` is pixels per inch
  - `fitToViewport(wall: Size, viewport: Viewport): Fit`
  - `wallToScreen(point: Point, wall: Size, fit: Fit): Point` — applies scale, offset, **and** the Y-flip
  - `screenToWall(point: Point, wall: Size, fit: Fit): Point` — the exact inverse

`wallToScreen` is the only place outside `toSvgY` that deals with the flip, and it delegates to `toSvgY` rather than reimplementing it. `screenToWall` exists so pointer coordinates can be converted back to inches when dragging lands in Plan 3.

- [ ] **Step 1: Write the failing test**

`packages/layout-engine/src/viewport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fitToViewport, screenToWall, wallToScreen } from './viewport.js';

const wall = { width: 144, height: 96 };

describe('fitToViewport', () => {
  it('fits a wide wall by width', () => {
    const fit = fitToViewport(wall, { width: 720, height: 720, padding: 0 });
    // 720 / 144 = 5 px per inch; height then needs 96 * 5 = 480 <= 720.
    expect(fit.scale).toBe(5);
  });

  it('fits a tall wall by height', () => {
    const fit = fitToViewport({ width: 96, height: 144 }, { width: 720, height: 360, padding: 0 });
    expect(fit.scale).toBe(2.5);
  });

  it('centres the wall in the leftover space', () => {
    const fit = fitToViewport(wall, { width: 720, height: 720, padding: 0 });
    expect(fit.offsetX).toBe(0);
    // 720 - 480 = 240 leftover, half above.
    expect(fit.offsetY).toBe(120);
  });

  it('subtracts padding from the usable area', () => {
    const fit = fitToViewport(wall, { width: 740, height: 740, padding: 10 });
    expect(fit.scale).toBe(5);
  });

  it('never returns a non-positive scale for a degenerate viewport', () => {
    const fit = fitToViewport(wall, { width: 10, height: 10, padding: 50 });
    expect(fit.scale).toBeGreaterThan(0);
  });
});

describe('wallToScreen', () => {
  const fit = fitToViewport(wall, { width: 720, height: 720, padding: 0 });

  it('puts the wall origin at the bottom-left of the drawn area', () => {
    // Wall (0,0) is the floor-left corner; on screen that is the BOTTOM.
    const p = wallToScreen({ x: 0, y: 0 }, wall, fit);
    expect(p.x).toBe(0);
    expect(p.y).toBe(120 + 480);
  });

  it('puts the wall top-left at the top', () => {
    const p = wallToScreen({ x: 0, y: 96 }, wall, fit);
    expect(p.y).toBe(120);
  });

  it('scales x by pixels per inch', () => {
    expect(wallToScreen({ x: 12, y: 0 }, wall, fit).x).toBe(60);
  });
});

describe('screenToWall', () => {
  const fit = fitToViewport(wall, { width: 720, height: 720, padding: 0 });

  it('is the exact inverse of wallToScreen', () => {
    for (const point of [{ x: 0, y: 0 }, { x: 144, y: 96 }, { x: 37.5, y: 62 }]) {
      const round = screenToWall(wallToScreen(point, wall, fit), wall, fit);
      expect(round.x).toBeCloseTo(point.x, 6);
      expect(round.y).toBeCloseTo(point.y, 6);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project node packages/layout-engine/src/viewport.test.ts`
Expected: FAIL — cannot resolve `./viewport.js`.

- [ ] **Step 3: Implement**

`packages/layout-engine/src/viewport.ts`:

```ts
import type { Point, Size } from './geometry.js';
import { toSvgY } from './geometry.js';

/** Viewport dimensions in PIXELS. */
export interface Viewport {
  width: number;
  height: number;
  padding: number;
}

export interface Fit {
  /** Pixels per inch. */
  scale: number;
  /** Pixels from the viewport's left edge to the wall's left edge. */
  offsetX: number;
  /** Pixels from the viewport's top edge to the wall's TOP edge. */
  offsetY: number;
}

/** Largest scale that fits the wall inside the padded viewport, centred. */
export function fitToViewport(wall: Size, viewport: Viewport): Fit {
  // Guard the degenerate case where padding exceeds the viewport, which would
  // otherwise produce a zero or negative scale and collapse the drawing.
  const usableWidth = Math.max(1, viewport.width - viewport.padding * 2);
  const usableHeight = Math.max(1, viewport.height - viewport.padding * 2);

  const scale = Math.min(usableWidth / wall.width, usableHeight / wall.height);

  const drawnWidth = wall.width * scale;
  const drawnHeight = wall.height * scale;

  return {
    scale,
    offsetX: viewport.padding + (usableWidth - drawnWidth) / 2,
    offsetY: viewport.padding + (usableHeight - drawnHeight) / 2,
  };
}

/**
 * Wall space (origin bottom-left, Y up, inches) to screen space (origin
 * top-left, Y down, pixels). The Y inversion is delegated to `toSvgY` rather
 * than repeated here — that function is the single flip in the codebase.
 */
export function wallToScreen(point: Point, wall: Size, fit: Fit): Point {
  return {
    x: fit.offsetX + point.x * fit.scale,
    y: fit.offsetY + toSvgY(wall.height, point.y) * fit.scale,
  };
}

/** Exact inverse of `wallToScreen`. Used to turn pointer positions into inches. */
export function screenToWall(point: Point, wall: Size, fit: Fit): Point {
  const svgY = (point.y - fit.offsetY) / fit.scale;
  return {
    x: (point.x - fit.offsetX) / fit.scale,
    y: toSvgY(wall.height, svgY),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project node packages/layout-engine`
Expected: PASS — 9 new tests, 31 in `layout-engine` total.

- [ ] **Step 5: Confirm purity, export, and commit**

Confirm `packages/layout-engine/src/viewport.ts` imports only from `./geometry.js` and nothing else:

```bash
grep -n "^import" packages/layout-engine/src/viewport.ts
```

Expected: only the two `./geometry.js` lines.

Add to `packages/layout-engine/src/index.ts`:

```ts
export * from './viewport.js';
```

Add to the "What's here" list in `packages/layout-engine/README.md`:

```
  viewport.ts   inches-to-pixels fitting, and the wall <-> screen transforms
```

```bash
git add packages/layout-engine
git commit -m "feat(layout-engine): add viewport fitting and wall/screen transforms"
```

---

### Task 6: Frontend API client and query setup

**Files:**
- Create: `app/src/api/client.ts`, `app/src/api/queries.ts`
- Test: `app/src/api/client.test.ts`
- Modify: `app/package.json`, `app/src/main.tsx`

**Interfaces:**
- Consumes: `getConfig()` from `app/src/config.ts`, `useAuth()` from `app/src/auth/AuthProvider.tsx`.
- Produces:
  - `class ApiError extends Error` with `status: number` and `code: string`
  - `apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T>`
  - Hooks in `queries.ts`: `useProjects()`, `useProject(id)`, `useCreateProject()`, `useDeleteProject()`, `useAddWall()`, `useUpdateWall()`, `useRemoveWall()`
  - `queryKeys` object: `{ projects: ['projects'], project: (id) => ['projects', id] }`

- [ ] **Step 1: Add dependencies**

In `app/package.json`, add to `dependencies`:

```json
    "@tanstack/react-query": "^5.101.4"
```

and to `devDependencies`:

```json
    "@testing-library/jest-dom": "^7.0.0",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1"
```

Run `npm install`.

- [ ] **Step 2: Write the failing test**

`app/src/api/client.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './client.js';

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
  vi.stubEnv('VITE_COGNITO_DOMAIN', 'https://auth.test');
  vi.stubEnv('VITE_USER_POOL_CLIENT_ID', 'abc');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('apiFetch', () => {
  it('attaches the bearer token and parses JSON', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiFetch('/projects', 'tok')).resolves.toEqual({ projects: [] });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.test/projects');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('throws ApiError carrying the status and the server error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiFetch('/projects/x', 'tok')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('still throws ApiError when the body is not JSON', async () => {
    // CloudFront can return an HTML error page; the client must not crash on it.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>502</html>', { status: 502 }),
    );

    const err = await apiFetch('/projects', 'tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
  });

  it('returns undefined for 204 rather than trying to parse an empty body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiFetch('/projects/x', 'tok', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --project app app/src/api/client.test.ts`
Expected: FAIL — cannot resolve `./client.js`.

- [ ] **Step 4: Implement the client**

`app/src/api/client.ts`:

```ts
import { getConfig } from '../config.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * One place that knows how to reach the API. Every caller passes the access
 * token explicitly rather than reading it from a module-level singleton, so a
 * stale token cannot leak in from somewhere unexpected.
 */
export async function apiFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${getConfig().apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
  });

  if (!res.ok) {
    // A non-JSON body is possible (a CloudFront or gateway error page), so
    // parsing must never be what surfaces to the user.
    let code = 'request_failed';
    let message = `Request failed with ${res.status}`;
    try {
      const body = (await res.json()) as ErrorBody;
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // keep the defaults
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run --project app`
Expected: PASS — 4 new tests, 11 in `app` total.

- [ ] **Step 6: Implement the query hooks**

`app/src/api/queries.ts`:

```ts
import type { CreateWallInput, Project, Wall } from '@pwe/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider.js';
import { apiFetch } from './client.js';

export const queryKeys = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
};

interface ProjectSummary {
  id: string;
  name: string;
  visibility: Project['visibility'];
  updatedAt: string;
}

/** Throws if called while signed out; every hook here is used behind a guard. */
function useToken(): string {
  const { accessToken } = useAuth();
  if (accessToken === null) throw new Error('not signed in');
  return accessToken;
}

export function useProjects() {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => apiFetch<{ projects: ProjectSummary[] }>('/projects', token),
  });
}

export function useProject(id: string) {
  const token = useToken();
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () =>
      apiFetch<{ project: Project & { version: number }; walls: Wall[] }>(
        `/projects/${id}`,
        token,
      ),
  });
}

export function useCreateProject() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ project: Project }>('/projects', token, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useDeleteProject() {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/projects/${id}`, token, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}

export function useAddWall(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wall: CreateWallInput) =>
      apiFetch<{ wall: Wall }>(`/projects/${projectId}/walls`, token, {
        method: 'POST',
        body: JSON.stringify(wall),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  });
}

export function useUpdateWall(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ wallId, wall }: { wallId: string; wall: CreateWallInput }) =>
      apiFetch<{ wall: Wall }>(`/projects/${projectId}/walls/${wallId}`, token, {
        method: 'PUT',
        body: JSON.stringify(wall),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  });
}

export function useRemoveWall(projectId: string) {
  const token = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (wallId: string) =>
      apiFetch<void>(`/projects/${projectId}/walls/${wallId}`, token, {
        method: 'DELETE',
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  });
}
```

- [ ] **Step 7: Add the provider and commit**

In `app/src/main.tsx`, import and wrap. Add to imports:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
```

Create the client above `createRoot`:

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The token refreshes in the background; a failed request is far more
      // likely to be a real error than something a retry will fix.
      retry: 1,
      staleTime: 30_000,
    },
  },
});
```

Wrap `<AuthProvider>` in `<QueryClientProvider client={queryClient}>`.

```bash
git add app
git commit -m "feat(app): add typed API client and TanStack Query hooks"
```

---

### Task 7: Projects list and create UI

**Files:**
- Create: `app/src/routes/Projects.tsx`
- Test: `app/src/routes/Projects.test.tsx`
- Modify: `app/src/main.tsx`, `app/src/routes/Home.tsx`, `app/README.md`

**Interfaces:**
- Consumes: `useProjects`, `useCreateProject`, `useDeleteProject` from Task 6.
- Produces: a `/projects` route listing the caller's projects with a create form and a delete control.

- [ ] **Step 1: Write the failing test**

`app/src/routes/Projects.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Projects } from './Projects.js';

const mocks = vi.hoisted(() => ({
  useProjects: vi.fn(),
  useCreateProject: vi.fn(),
  useDeleteProject: vi.fn(),
}));

vi.mock('../api/queries.js', () => mocks);

function renderProjects() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Projects />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.useCreateProject.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mocks.useDeleteProject.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

afterEach(() => vi.clearAllMocks());

describe('Projects', () => {
  it('shows a loading state first', () => {
    mocks.useProjects.mockReturnValue({ isLoading: true });
    renderProjects();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('lists the projects it receives', () => {
    mocks.useProjects.mockReturnValue({
      isLoading: false,
      data: { projects: [{ id: 'p1', name: 'Living Room', visibility: 'private', updatedAt: 'x' }] },
    });
    renderProjects();
    expect(screen.getByText('Living Room')).toBeInTheDocument();
  });

  it('tells the user when they have none, rather than showing an empty page', () => {
    mocks.useProjects.mockReturnValue({ isLoading: false, data: { projects: [] } });
    renderProjects();
    expect(screen.getByText(/no projects yet/i)).toBeInTheDocument();
  });

  it('surfaces an error instead of failing silently', () => {
    mocks.useProjects.mockReturnValue({
      isLoading: false,
      error: new Error('boom'),
    });
    renderProjects();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('creates a project with the typed name', async () => {
    const mutate = vi.fn();
    mocks.useProjects.mockReturnValue({ isLoading: false, data: { projects: [] } });
    mocks.useCreateProject.mockReturnValue({ mutate, isPending: false });

    renderProjects();
    await userEvent.type(screen.getByLabelText(/project name/i), 'Hallway');
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(mutate).toHaveBeenCalledWith('Hallway'));
  });

  it('does not submit an empty name', async () => {
    const mutate = vi.fn();
    mocks.useProjects.mockReturnValue({ isLoading: false, data: { projects: [] } });
    mocks.useCreateProject.mockReturnValue({ mutate, isPending: false });

    renderProjects();
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    expect(mutate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Add the jest-dom matchers**

Create `app/src/setup-tests.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

In the root `vitest.config.ts`, add `setupFiles: ['./app/src/setup-tests.ts']` to the **app project's** `test` block only. Leave the node project untouched.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run --project app app/src/routes/Projects.test.tsx`
Expected: FAIL — cannot resolve `./Projects.js`.

- [ ] **Step 4: Implement**

`app/src/routes/Projects.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router';
import { useCreateProject, useDeleteProject, useProjects } from '../api/queries.js';

export function Projects() {
  const { data, isLoading, error } = useProjects();
  const create = useCreateProject();
  const remove = useDeleteProject();
  const [name, setName] = useState('');

  if (isLoading) return <p>Loading your projects…</p>;

  if (error) {
    return (
      <p role="alert">Could not load your projects: {(error as Error).message}</p>
    );
  }

  const projects = data?.projects ?? [];

  return (
    <main>
      <h1>Projects</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (trimmed === '') return;
          create.mutate(trimmed);
          setName('');
        }}
      >
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
      </form>

      {projects.length === 0 ? (
        <p>No projects yet. Create one above to get started.</p>
      ) : (
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/projects/${p.id}`}>{p.name}</Link>
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                aria-label={`Delete ${p.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Add the route and a link from Home**

In `app/src/main.tsx`, add `<Route path="/projects" element={<Projects />} />` and import it.

In `app/src/routes/Home.tsx`, add a link inside the signed-in branch:

```tsx
      <p><Link to="/projects">Your projects</Link></p>
```

importing `Link` from `react-router`.

- [ ] **Step 6: Run tests, update README, commit**

Run: `npx vitest run --project app`
Expected: PASS — 6 new tests, 17 in `app` total.

Add a Routes section to `app/README.md`:

```markdown
## Routes

| Path | Purpose |
|---|---|
| `/` | sign in / sign out |
| `/callback` | OAuth redirect target |
| `/projects` | list and create projects |
| `/projects/:id` | one project and its walls |
```

```bash
git add app
git commit -m "feat(app): add the projects list and create form"
```

---

### Task 8: Wall editor with obstructions

**Files:**
- Create: `app/src/routes/Project.tsx`, `app/src/components/WallCanvas.tsx`
- Test: `app/src/components/WallCanvas.test.tsx`
- Modify: `app/src/main.tsx`, `app/README.md`

**Interfaces:**
- Consumes: `useProject`, `useAddWall`, `useRemoveWall` from Task 6; `fitToViewport`, `wallToScreen`, `formatLength` from `@pwe/layout-engine`; `Wall`, `Obstruction` from `@pwe/shared`.
- Produces:
  - `WallCanvas({ wall, viewport, lengthMode })` — renders the wall and its obstructions to scale as SVG
  - A `/projects/:id` route that lists walls, adds one, and renders the selected wall

The canvas is a pure presentational component: it takes a wall and a viewport and draws. All geometry comes from `layout-engine`, so the component itself contains no arithmetic beyond passing values through.

- [ ] **Step 1: Write the failing test**

`app/src/components/WallCanvas.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WallCanvas } from './WallCanvas.js';

const wall = {
  id: 'w1',
  name: 'North',
  widthIn: 144,
  heightIn: 96,
  obstructions: [
    { id: 'o1', kind: 'door' as const, label: 'Front door', xIn: 12, yIn: 0, widthIn: 32, heightIn: 80 },
    { id: 'o2', kind: 'window' as const, label: 'Bay', xIn: 90, yIn: 36, widthIn: 36, heightIn: 48 },
  ],
};

const viewport = { width: 720, height: 720, padding: 0 };

describe('WallCanvas', () => {
  it('labels the wall with its real dimensions', () => {
    render(<WallCanvas wall={wall} viewport={viewport} lengthMode="inches" />);
    expect(screen.getByText(/144"/)).toBeInTheDocument();
    expect(screen.getByText(/96"/)).toBeInTheDocument();
  });

  it('honours the feet-and-inches display mode', () => {
    render(<WallCanvas wall={wall} viewport={viewport} lengthMode="feet-inches" />);
    expect(screen.getByText(/12'/)).toBeInTheDocument();
  });

  it('draws every obstruction', () => {
    render(<WallCanvas wall={wall} viewport={viewport} lengthMode="inches" />);
    expect(screen.getByTestId('obstruction-o1')).toBeInTheDocument();
    expect(screen.getByTestId('obstruction-o2')).toBeInTheDocument();
  });

  it('places a floor-level obstruction at the BOTTOM of the drawing', () => {
    // The door sits at yIn 0, which is the floor. In SVG that must be the
    // largest y, not the smallest — this is the wall-space Y-up convention.
    render(<WallCanvas wall={wall} viewport={viewport} lengthMode="inches" />);

    const door = screen.getByTestId('obstruction-o1');
    const window_ = screen.getByTestId('obstruction-o2');

    const doorY = Number(door.getAttribute('y'));
    const windowY = Number(window_.getAttribute('y'));

    // Door top is 80" up; window top is 36+48 = 84" up. Higher on the wall
    // means smaller SVG y.
    expect(doorY).toBeGreaterThan(windowY);
  });

  it('scales an obstruction to its true size', () => {
    // 720px / 144in = 5 px per inch, so a 32" door is 160px wide.
    render(<WallCanvas wall={wall} viewport={viewport} lengthMode="inches" />);
    expect(screen.getByTestId('obstruction-o1').getAttribute('width')).toBe('160');
  });

  it('names each obstruction for screen readers', () => {
    render(<WallCanvas wall={wall} viewport={viewport} lengthMode="inches" />);
    expect(screen.getByLabelText(/Front door/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project app app/src/components/WallCanvas.test.tsx`
Expected: FAIL — cannot resolve `./WallCanvas.js`.

- [ ] **Step 3: Implement the canvas**

`app/src/components/WallCanvas.tsx`:

```tsx
import type { Obstruction, Wall } from '@pwe/shared';
import {
  type LengthMode,
  type Viewport,
  fitToViewport,
  formatLength,
  wallToScreen,
} from '@pwe/layout-engine';

const KIND_FILL: Record<Obstruction['kind'], string> = {
  door: '#c9b28a',
  window: '#a8c8e0',
  outlet: '#d0d0d0',
  generic: '#cfcfcf',
};

export interface WallCanvasProps {
  wall: Wall;
  viewport: Viewport;
  lengthMode: LengthMode;
}

export function WallCanvas({ wall, viewport, lengthMode }: WallCanvasProps) {
  const size = { width: wall.widthIn, height: wall.heightIn };
  const fit = fitToViewport(size, viewport);

  // Top-left of the drawn wall, in screen pixels.
  const topLeft = wallToScreen({ x: 0, y: wall.heightIn }, size, fit);
  const drawnWidth = wall.widthIn * fit.scale;
  const drawnHeight = wall.heightIn * fit.scale;

  return (
    <svg
      width={viewport.width}
      height={viewport.height}
      role="img"
      aria-label={`${wall.name}, ${formatLength(wall.widthIn, lengthMode)} by ${formatLength(wall.heightIn, lengthMode)}`}
    >
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={drawnWidth}
        height={drawnHeight}
        fill="#faf8f5"
        stroke="#333"
        strokeWidth={2}
      />

      {wall.obstructions.map((o) => {
        // An obstruction's stored y is its BOTTOM edge in wall space, so its
        // screen position comes from its top edge.
        const corner = wallToScreen({ x: o.xIn, y: o.yIn + o.heightIn }, size, fit);
        return (
          <rect
            key={o.id}
            data-testid={`obstruction-${o.id}`}
            aria-label={`${o.kind}: ${o.label}`}
            x={corner.x}
            y={corner.y}
            width={o.widthIn * fit.scale}
            height={o.heightIn * fit.scale}
            fill={KIND_FILL[o.kind]}
            stroke="#555"
            strokeWidth={1}
          />
        );
      })}

      <text x={topLeft.x} y={topLeft.y + drawnHeight + 18} fontSize={13}>
        {formatLength(wall.widthIn, lengthMode)} wide
      </text>
      <text x={topLeft.x} y={topLeft.y - 6} fontSize={13}>
        {formatLength(wall.heightIn, lengthMode)} tall
      </text>
    </svg>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project app`
Expected: PASS — 6 new tests, 23 in `app` total.

- [ ] **Step 5: Implement the project route**

`app/src/routes/Project.tsx`:

```tsx
import type { LengthMode } from '@pwe/layout-engine';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useAddWall, useProject, useRemoveWall } from '../api/queries.js';
import { WallCanvas } from '../components/WallCanvas.js';

const VIEWPORT = { width: 720, height: 480, padding: 24 };

export function Project() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useProject(id);
  const addWall = useAddWall(id);
  const removeWall = useRemoveWall(id);

  const [name, setName] = useState('');
  const [widthIn, setWidthIn] = useState('144');
  const [heightIn, setHeightIn] = useState('96');
  const [selected, setSelected] = useState<string | null>(null);
  const [lengthMode, setLengthMode] = useState<LengthMode>('inches');

  if (isLoading) return <p>Loading project…</p>;
  if (error) return <p role="alert">Could not load this project: {(error as Error).message}</p>;

  const walls = data?.walls ?? [];
  const active = walls.find((w) => w.id === selected) ?? walls[0];

  return (
    <main>
      <h1>{data?.project.name}</h1>

      <button type="button" onClick={() => setLengthMode(lengthMode === 'inches' ? 'feet-inches' : 'inches')}>
        Show {lengthMode === 'inches' ? 'feet and inches' : 'inches'}
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const w = Number(widthIn);
          const h = Number(heightIn);
          if (name.trim() === '' || !(w > 0) || !(h > 0)) return;
          addWall.mutate({ name: name.trim(), widthIn: w, heightIn: h });
          setName('');
        }}
      >
        <label htmlFor="wall-name">Wall name</label>
        <input id="wall-name" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="wall-width">Width (inches)</label>
        <input id="wall-width" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} />

        <label htmlFor="wall-height">Height (inches)</label>
        <input id="wall-height" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />

        <button type="submit" disabled={addWall.isPending}>Add wall</button>
      </form>

      {walls.length === 0 ? (
        <p>No walls yet. Add one above.</p>
      ) : (
        <>
          <ul>
            {walls.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => setSelected(w.id)}>{w.name}</button>
                <button type="button" aria-label={`Delete ${w.name}`} onClick={() => removeWall.mutate(w.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>

          {active !== undefined && (
            <WallCanvas wall={active} viewport={VIEWPORT} lengthMode={lengthMode} />
          )}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Add the route and commit**

In `app/src/main.tsx`, add `<Route path="/projects/:id" element={<Project />} />` and import it.

Run the full suite and typecheck:

```bash
npm run typecheck && npm test && npm run build
```

Expected: typecheck exits 0; build exits 0; **132 tests** total —
31 layout-engine + 23 shared + 39 api + 16 infrastructure + 23 app.
Report the real numbers; if any differ, count the `it` blocks and tell me
rather than adjusting tests to match.

```bash
git add app
git commit -m "feat(app): add the wall editor with to-scale obstruction rendering"
```

---

### Task 9: Adding and removing obstructions

**Files:**
- Create: `app/src/components/ObstructionForm.tsx`
- Test: `app/src/components/ObstructionForm.test.tsx`
- Modify: `app/src/routes/Project.tsx`, `app/README.md`

**Interfaces:**
- Consumes: `useUpdateWall` from Task 6; `parseLength` from `@pwe/layout-engine`; `Obstruction`, `Wall` from `@pwe/shared`.
- Produces: `ObstructionForm({ wall, onSubmit })` — collects one obstruction and hands it up; the parent persists by PUTting the whole wall with the extended `obstructions` array.

Task 8 draws obstructions but nothing can create one, which makes that rendering unreachable in the running app. This task closes that: it is what makes "wall editor with obstructions" true rather than half-true.

Obstructions are stored inside the wall item, so adding one is a **wall replace**, not a separate endpoint. That keeps the write atomic — no partial state where a wall exists but its obstruction list is stale.

- [ ] **Step 1: Write the failing test**

`app/src/components/ObstructionForm.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ObstructionForm } from './ObstructionForm.js';

const wall = {
  id: 'w1', name: 'North', widthIn: 144, heightIn: 96, obstructions: [],
};

describe('ObstructionForm', () => {
  it('submits an obstruction with the entered dimensions', async () => {
    const onSubmit = vi.fn();
    render(<ObstructionForm wall={wall} onSubmit={onSubmit} />);

    await userEvent.selectOptions(screen.getByLabelText(/type/i), 'door');
    await userEvent.type(screen.getByLabelText(/label/i), 'Front door');
    await userEvent.clear(screen.getByLabelText(/from left/i));
    await userEvent.type(screen.getByLabelText(/from left/i), '12');
    await userEvent.clear(screen.getByLabelText(/from floor/i));
    await userEvent.type(screen.getByLabelText(/from floor/i), '0');
    await userEvent.clear(screen.getByLabelText(/^width/i));
    await userEvent.type(screen.getByLabelText(/^width/i), '32');
    await userEvent.clear(screen.getByLabelText(/^height/i));
    await userEvent.type(screen.getByLabelText(/^height/i), '80');
    await userEvent.click(screen.getByRole('button', { name: /add obstruction/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'door', label: 'Front door',
        xIn: 12, yIn: 0, widthIn: 32, heightIn: 80,
      }),
    );
  });

  it('accepts feet-and-inches input and stores inches', async () => {
    const onSubmit = vi.fn();
    render(<ObstructionForm wall={wall} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Bay');
    await userEvent.clear(screen.getByLabelText(/^width/i));
    await userEvent.type(screen.getByLabelText(/^width/i), "3'");
    await userEvent.clear(screen.getByLabelText(/^height/i));
    await userEvent.type(screen.getByLabelText(/^height/i), '48');
    await userEvent.click(screen.getByRole('button', { name: /add obstruction/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ widthIn: 36 }),
    );
  });

  it('refuses an obstruction that does not fit on the wall', async () => {
    const onSubmit = vi.fn();
    render(<ObstructionForm wall={wall} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Too wide');
    await userEvent.clear(screen.getByLabelText(/^width/i));
    await userEvent.type(screen.getByLabelText(/^width/i), '200');
    await userEvent.clear(screen.getByLabelText(/^height/i));
    await userEvent.type(screen.getByLabelText(/^height/i), '10');
    await userEvent.click(screen.getByRole('button', { name: /add obstruction/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/does not fit/i);
  });

  it('rejects an unparseable dimension', async () => {
    const onSubmit = vi.fn();
    render(<ObstructionForm wall={wall} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/label/i), 'Bad');
    await userEvent.clear(screen.getByLabelText(/^width/i));
    await userEvent.type(screen.getByLabelText(/^width/i), 'wide');
    await userEvent.click(screen.getByRole('button', { name: /add obstruction/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('gives each obstruction a distinct id', async () => {
    const onSubmit = vi.fn();
    render(<ObstructionForm wall={wall} onSubmit={onSubmit} />);

    const submit = async (label: string) => {
      await userEvent.clear(screen.getByLabelText(/label/i));
      await userEvent.type(screen.getByLabelText(/label/i), label);
      await userEvent.clear(screen.getByLabelText(/^width/i));
      await userEvent.type(screen.getByLabelText(/^width/i), '10');
      await userEvent.clear(screen.getByLabelText(/^height/i));
      await userEvent.type(screen.getByLabelText(/^height/i), '10');
      await userEvent.click(screen.getByRole('button', { name: /add obstruction/i }));
    };

    await submit('One');
    await submit('Two');

    const ids = onSubmit.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(new Set(ids).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project app app/src/components/ObstructionForm.test.tsx`
Expected: FAIL — cannot resolve `./ObstructionForm.js`.

- [ ] **Step 3: Implement**

`app/src/components/ObstructionForm.tsx`:

```tsx
import { parseLength } from '@pwe/layout-engine';
import type { Obstruction, ObstructionKind, Wall } from '@pwe/shared';
import { useState } from 'react';

const KINDS: ObstructionKind[] = ['door', 'window', 'outlet', 'generic'];

export interface ObstructionFormProps {
  wall: Wall;
  onSubmit: (obstruction: Obstruction) => void;
}

export function ObstructionForm({ wall, onSubmit }: ObstructionFormProps) {
  const [kind, setKind] = useState<ObstructionKind>('door');
  const [label, setLabel] = useState('');
  const [xIn, setXIn] = useState('0');
  const [yIn, setYIn] = useState('0');
  const [widthIn, setWidthIn] = useState('32');
  const [heightIn, setHeightIn] = useState('80');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // parseLength accepts both `32` and `2' 8"`, so the same field serves
    // either habit without a separate unit toggle.
    const x = parseLength(xIn);
    const y = parseLength(yIn);
    const w = parseLength(widthIn);
    const h = parseLength(heightIn);

    if (x === null || y === null || w === null || h === null) {
      setError('Enter each measurement as inches (32) or feet and inches (2\' 8").');
      return;
    }
    if (w <= 0 || h <= 0) {
      setError('Width and height must be greater than zero.');
      return;
    }
    if (x + w > wall.widthIn || y + h > wall.heightIn) {
      setError(
        `That does not fit — the wall is ${wall.widthIn}" by ${wall.heightIn}".`,
      );
      return;
    }

    onSubmit({
      id: crypto.randomUUID(),
      kind,
      label: label.trim(),
      xIn: x,
      yIn: y,
      widthIn: w,
      heightIn: h,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Add an obstruction</h3>

      <label htmlFor="obs-kind">Type</label>
      <select
        id="obs-kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as ObstructionKind)}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>

      <label htmlFor="obs-label">Label</label>
      <input id="obs-label" value={label} onChange={(e) => setLabel(e.target.value)} />

      <label htmlFor="obs-x">From left</label>
      <input id="obs-x" value={xIn} onChange={(e) => setXIn(e.target.value)} />

      <label htmlFor="obs-y">From floor</label>
      <input id="obs-y" value={yIn} onChange={(e) => setYIn(e.target.value)} />

      <label htmlFor="obs-width">Width</label>
      <input id="obs-width" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} />

      <label htmlFor="obs-height">Height</label>
      <input id="obs-height" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />

      {error !== null && <p role="alert">{error}</p>}

      <button type="submit">Add obstruction</button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project app`
Expected: PASS — 5 new tests, 28 in `app` total.

- [ ] **Step 5: Wire it into the project route**

In `app/src/routes/Project.tsx`, import the form and `useUpdateWall`:

```tsx
import { useUpdateWall } from '../api/queries.js';
import { ObstructionForm } from '../components/ObstructionForm.js';
```

Add the hook alongside the others:

```tsx
  const updateWall = useUpdateWall(id);
```

Then, immediately after `<WallCanvas … />` inside the `active !== undefined` block, add:

```tsx
              <ObstructionForm
                wall={active}
                onSubmit={(obstruction) =>
                  updateWall.mutate({
                    wallId: active.id,
                    wall: {
                      name: active.name,
                      widthIn: active.widthIn,
                      heightIn: active.heightIn,
                      // Obstructions live inside the wall item, so adding one
                      // is a whole-wall replace rather than a separate write.
                      obstructions: [...active.obstructions, obstruction],
                    },
                  })
                }
              />

              <ul>
                {active.obstructions.map((o) => (
                  <li key={o.id}>
                    {o.kind}: {o.label}
                    <button
                      type="button"
                      aria-label={`Remove ${o.label}`}
                      onClick={() =>
                        updateWall.mutate({
                          wallId: active.id,
                          wall: {
                            name: active.name,
                            widthIn: active.widthIn,
                            heightIn: active.heightIn,
                            obstructions: active.obstructions.filter((x) => x.id !== o.id),
                          },
                        })
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
```

- [ ] **Step 6: Run everything and commit**

```bash
npm run typecheck && npm test && npm run build
```

Expected: typecheck exits 0; build exits 0; **137 tests** total —
31 layout-engine + 23 shared + 39 api + 16 infrastructure + 28 app.
Report the real numbers.

Add to `app/README.md` under Routes, or as a short note:

```markdown
Obstructions are stored inside their wall, so adding or removing one replaces
the whole wall record rather than hitting a separate endpoint.
```

```bash
git add app
git commit -m "feat(app): add and remove obstructions on a wall"
```

---

## Definition of Done

- [ ] `npm run typecheck`, `npm test`, and `npm run build` all pass from the repo root.
- [ ] CI and Deploy are both green on `main`.
- [ ] **No AWS account ID anywhere in git HISTORY**, not just the working tree:
      `for c in $(git rev-list --all); do git grep -q "[0-9]\{12\}" "$c" && echo "LEAK $c"; done` finds nothing but `111111111111`.
- [ ] `packages/layout-engine` still imports nothing: `grep -rn "^import" packages/layout-engine/src --include="*.ts" | grep -v "\.test\.ts" | grep -v "from './"` is empty.
- [ ] `toSvgY` is still the only Y-inversion: `grep -rn "heightIn -\|height -" app/src packages/layout-engine/src` shows only `geometry.ts`.
- [ ] Signed in against the live site, a user can create a project, add a wall, and see it drawn to scale.
- [ ] `GET /projects/:id` for a project owned by someone else returns **404**, and the body contains no hint that it exists.

## Manual verification (needs a human, after deploy)

1. Sign in at the deployed URL and open **Your projects**.
2. Create a project called "Living Room". It appears in the list.
3. Open it, add a wall 144 × 96 inches. It draws as a wide rectangle.
4. Toggle to feet and inches — the labels read `12'` and `8'`.
5. Add a door 32" wide, 80" tall, 12" from the left, 0" from the floor. It draws at the BOTTOM of the wall, a fifth of its width.
6. Add a window 36x48 at 90" from left, 36" from floor. It draws higher than the door.
7. Try a 200"-wide obstruction — it is refused with a "does not fit" message.
8. Reload. Everything persists.
9. Remove the door, delete the wall, then the project. Each disappears.

## Deferred to Plan 3

- Poster library, presigned uploads, and the sharp thumbnail pipeline.
- Drag-and-drop, snapping, guides, collision detection, auto-arrange.
- `screenToWall` is implemented and tested but not yet used; it exists because pointer-to-inches conversion is the first thing dragging needs.
