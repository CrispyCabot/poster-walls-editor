# Poster Walls Editor — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo, the AWS infrastructure, and Cognito login, ending with a deployed app at a CloudFront URL that a real user can sign into.

**Architecture:** An npm-workspaces monorepo with four workspaces — `app` (React SPA), `api` (Hono in one Lambda), `infrastructure` (CDK), and `packages/*` (shared zod contracts plus a dependency-free layout engine). CDK provisions DynamoDB, Lambda, API Gateway HTTP API, S3, CloudFront, and Cognito into a single us-east-1 stack. GitHub Actions deploys via OIDC role assumption in two phases, because the SPA needs stack outputs at build time.

**Tech Stack:** TypeScript 5.7, Node 22, React 19, Vite 6, Hono 4, AWS CDK 2, DynamoDB, Cognito, vitest, zod 3.

## Global Constraints

Copied verbatim from the spec; every task inherits these.

- **Everything is TypeScript.** No JavaScript source files outside generated output.
- **Region is `us-east-1`** for all resources. One stack, no `crossRegionReferences`, no separate certificate stack.
- **`packages/layout-engine` imports neither React, nor the DOM, nor the AWS SDK.** Pure functions only. This is load-bearing and must not erode.
- **All lengths are inches** in stored data and in every layout-engine signature. Feet-and-inches is a display format only.
- **Wall space has its origin at the wall's bottom-left corner, Y increasing upward.** The Y-flip to SVG coordinates exists in exactly one transform function.
- **Placements store the center** of the framed poster, not a corner.
- **Poster defaults: frame width 1 inch, frame color `#000000`.**
- **Ownership failures return 404, never 403**, so the API never confirms a private project exists.
- **The AWS account ID must not appear in any committed file.** It reaches CI through the `AWS_DEPLOY_ROLE_ARN` repository secret.
- **Target repo:** `https://github.com/CrispyCabot/poster-walls-editor.git` (public). Local repo already initialized at the project root with `origin` set.
- Custom domain stays **off** for this entire plan (`useCustomDomain: false`). Domain cutover is Plan 4.

## Prerequisites

- AWS CLI authenticated as `claude-home-desktop` (IAM user, `AdministratorAccess`), region `us-east-1`. **Already verified.**
- `gh` authenticated as `CrispyCabot` with `repo` + `workflow` scopes. **Already verified.**
- Node 22+ and npm 10+ on PATH.
- Root access keys deleted in the console — outstanding, does not block this plan.

## File Structure

```
package.json                          workspaces root, shared scripts
tsconfig.base.json                    strict compiler options, inherited by all
.github/workflows/ci.yml              PR + push: typecheck, test, build, cdk synth
.github/workflows/deploy.yml          push to main: OIDC → cdk deploy → build → sync

packages/layout-engine/
  src/units.ts                        inch ↔ feet-inches formatting and parsing
  src/geometry.ts                     Rect/Point types, outer footprint, overlap test
  src/index.ts                        public surface
  src/units.test.ts
  src/geometry.test.ts

packages/shared/
  src/ids.ts                          branded ID types + constructors
  src/schemas.ts                      zod schemas: Obstruction, Wall, Poster, Placement, Project
  src/index.ts
  src/schemas.test.ts

api/
  src/app.ts                          Hono app, routes, middleware — no Lambda coupling
  src/auth.ts                         Cognito JWT verification middleware
  src/errors.ts                       error shape + Hono error handler
  src/lambda.ts                       Lambda entrypoint, wraps app.ts
  src/app.test.ts
  src/auth.test.ts

infrastructure/
  bin/app.ts                          CDK entrypoint, config flags
  lib/bootstrap-stack.ts              GitHub OIDC provider + deploy role
  lib/main-stack.ts                   composes the constructs below
  lib/constructs/data.ts              DynamoDB table
  lib/constructs/api.ts               Lambda + HTTP API
  lib/constructs/web.ts               S3 buckets + CloudFront
  lib/constructs/auth.ts              Cognito user pool + client + domain
  test/main-stack.test.ts             synth snapshot + targeted assertions

app/
  src/main.tsx                        React root
  src/config.ts                       reads VITE_* env, fails loudly if absent
  src/auth/oidc.ts                    OIDC PKCE client configuration
  src/auth/AuthProvider.tsx           session context
  src/routes/Callback.tsx             OAuth redirect handler
  src/routes/Home.tsx                 signed-in landing, calls /me
  src/config.test.ts
```

`layout-engine` and `shared` come first because `api` and `app` both depend on them, and they are the only workspaces testable with zero infrastructure.

---

### Task 1: Monorepo scaffold and CI

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.github/workflows/ci.yml`
- Create: `packages/layout-engine/package.json`, `packages/layout-engine/tsconfig.json`, `packages/layout-engine/src/index.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Create: `vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: workspaces `@pwe/layout-engine` and `@pwe/shared`, resolvable by name from `api` and `app`. Root scripts `npm run typecheck`, `npm run test`, `npm run build`.

- [ ] **Step 1: Create the workspace root**

`package.json`:

```json
{
  "name": "poster-walls-editor",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "api", "app", "infrastructure"],
  "engines": { "node": ">=22" },
  "scripts": {
    "typecheck": "tsc --build",
    "test": "vitest run",
    "build": "npm run build --workspaces --if-present"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "declaration": true,
    "composite": true
  }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{packages,api,app,infrastructure}/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
```

- [ ] **Step 2: Create the two leaf workspaces**

`packages/layout-engine/package.json`:

```json
{
  "name": "@pwe/layout-engine",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

`packages/shared/package.json`:

```json
{
  "name": "@pwe/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": { "zod": "^3.24.1" }
}
```

Both get an identical `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

Both get a placeholder `src/index.ts` containing `export {};` so `tsc --build` succeeds before any real code exists.

- [ ] **Step 3: Install and verify the toolchain runs**

Run: `npm install`
Then: `npm run typecheck`
Expected: exits 0. `npm run test` reports "No test files found" and exits 0.

- [ ] **Step 4: Add CI**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

`cdk synth` joins this job in Task 6, once the CDK workspace exists.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "chore: scaffold npm workspaces monorepo with CI"
git push -u origin main
```

Expected: the push succeeds and the CI workflow goes green on GitHub. Confirm with `gh run list --limit 1`.

---

### Task 2: `layout-engine` unit formatting

**Files:**
- Create: `packages/layout-engine/src/units.ts`
- Test: `packages/layout-engine/src/units.test.ts`
- Modify: `packages/layout-engine/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type LengthMode = 'inches' | 'feet-inches'`
  - `formatLength(inches: number, mode: LengthMode): string`
  - `parseLength(input: string): number | null` — returns inches, or `null` when unparseable.

- [ ] **Step 1: Write the failing tests**

`packages/layout-engine/src/units.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatLength, parseLength } from './units.js';

describe('formatLength', () => {
  it('renders inches with no trailing zeros', () => {
    expect(formatLength(62, 'inches')).toBe('62"');
    expect(formatLength(62.5, 'inches')).toBe('62.5"');
    expect(formatLength(62.0, 'inches')).toBe('62"');
  });

  it('renders feet and inches', () => {
    expect(formatLength(62, 'feet-inches')).toBe('5\' 2"');
    expect(formatLength(24, 'feet-inches')).toBe('2\'');
    expect(formatLength(8, 'feet-inches')).toBe('8"');
  });

  it('rounds to two decimals rather than emitting float noise', () => {
    expect(formatLength(0.1 + 0.2, 'inches')).toBe('0.3"');
  });

  it('handles zero', () => {
    expect(formatLength(0, 'inches')).toBe('0"');
    expect(formatLength(0, 'feet-inches')).toBe('0"');
  });

  it('carries a remainder that rounds up to 12 into the feet', () => {
    expect(formatLength(23.999, 'feet-inches')).toBe("2'");
    expect(formatLength(11.999, 'feet-inches')).toBe("1'");
  });
});

describe('parseLength', () => {
  it('parses bare numbers as inches', () => {
    expect(parseLength('62')).toBe(62);
    expect(parseLength('62.5')).toBe(62.5);
  });

  it('parses inch marks', () => {
    expect(parseLength('62"')).toBe(62);
  });

  it('parses feet and inches', () => {
    expect(parseLength(`5' 2"`)).toBe(62);
    expect(parseLength(`5'2`)).toBe(62);
    expect(parseLength(`5'`)).toBe(60);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseLength('  62  ')).toBe(62);
  });

  it('rejects garbage', () => {
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('')).toBeNull();
    expect(parseLength('-5')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/layout-engine`
Expected: FAIL — `Failed to resolve import "./units.js"`.

- [ ] **Step 3: Implement**

`packages/layout-engine/src/units.ts`:

```ts
export type LengthMode = 'inches' | 'feet-inches';

/** Rounds to 2dp and strips trailing zeros, so 62.0 renders as "62". */
function trim(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatLength(inches: number, mode: LengthMode): string {
  if (mode === 'inches') return `${trim(inches)}"`;

  // Round to display precision BEFORE splitting feet from inches. Splitting
  // first lets a remainder that rounds up to 12 render as "1' 12"" — e.g.
  // 23.999 gives feet=1 and a remainder that rounds to 12, instead of "2'".
  const rounded = Math.round(inches * 100) / 100;
  const feet = Math.floor(rounded / 12);
  const remainder = Math.round((rounded - feet * 12) * 100) / 100;

  if (feet === 0) return `${trim(remainder)}"`;
  if (remainder === 0) return `${feet}'`;
  return `${feet}' ${trim(remainder)}"`;
}

const FEET_INCHES = /^(\d+(?:\.\d+)?)'\s*(\d+(?:\.\d+)?)?"?$/;
const INCHES_ONLY = /^(\d+(?:\.\d+)?)"?$/;

/** Returns inches, or null when the input is not a non-negative length. */
export function parseLength(input: string): number | null {
  const text = input.trim();
  if (text === '') return null;

  const feetMatch = FEET_INCHES.exec(text);
  if (feetMatch) {
    const feet = Number(feetMatch[1]);
    const inches = feetMatch[2] === undefined ? 0 : Number(feetMatch[2]);
    return feet * 12 + inches;
  }

  const inchMatch = INCHES_ONLY.exec(text);
  if (inchMatch) return Number(inchMatch[1]);

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/layout-engine`
Expected: PASS, 10 tests.

- [ ] **Step 5: Export and commit**

Set `packages/layout-engine/src/index.ts` to:

```ts
export * from './units.js';
```

```bash
git add packages/layout-engine
git commit -m "feat(layout-engine): add inch and feet-inches formatting"
```

---

### Task 3: `layout-engine` geometry primitives

**Files:**
- Create: `packages/layout-engine/src/geometry.ts`
- Test: `packages/layout-engine/src/geometry.test.ts`
- Modify: `packages/layout-engine/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Point { x: number; y: number }` — wall space, inches, origin bottom-left, Y up.
  - `interface Size { width: number; height: number }`
  - `interface Rect { x: number; y: number; width: number; height: number }` — `x`/`y` is the **bottom-left** corner.
  - `outerSize(poster: { width: number; height: number; frameWidth: number }): Size`
  - `rectFromCenter(center: Point, size: Size): Rect`
  - `overlaps(a: Rect, b: Rect): boolean` — edge contact is not overlap.
  - `containsRect(outer: Rect, inner: Rect): boolean`
  - `toSvgY(wallHeight: number, y: number): number` — **the only Y-flip in the codebase.**

- [ ] **Step 1: Write the failing tests**

`packages/layout-engine/src/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  containsRect,
  outerSize,
  overlaps,
  rectFromCenter,
  toSvgY,
} from './geometry.js';

describe('outerSize', () => {
  it('adds the frame to both sides of each dimension', () => {
    expect(outerSize({ width: 24, height: 36, frameWidth: 1 }))
      .toEqual({ width: 26, height: 38 });
  });

  it('is a no-op for a frameless poster', () => {
    expect(outerSize({ width: 24, height: 36, frameWidth: 0 }))
      .toEqual({ width: 24, height: 36 });
  });
});

describe('rectFromCenter', () => {
  it('places the bottom-left corner half a size below and left of center', () => {
    expect(rectFromCenter({ x: 50, y: 60 }, { width: 26, height: 38 }))
      .toEqual({ x: 37, y: 41, width: 26, height: 38 });
  });
});

describe('overlaps', () => {
  const base = { x: 0, y: 0, width: 10, height: 10 };

  it('detects a true intersection', () => {
    expect(overlaps(base, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it('treats edge contact as non-overlapping', () => {
    expect(overlaps(base, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('returns false for disjoint rects', () => {
    expect(overlaps(base, { x: 50, y: 50, width: 10, height: 10 })).toBe(false);
  });

  it('is true when one rect fully contains the other', () => {
    expect(overlaps(base, { x: 2, y: 2, width: 3, height: 3 })).toBe(true);
  });
});

describe('containsRect', () => {
  const wall = { x: 0, y: 0, width: 100, height: 100 };

  it('accepts a fully enclosed rect', () => {
    expect(containsRect(wall, { x: 10, y: 10, width: 10, height: 10 })).toBe(true);
  });

  it('accepts a flush-edge rect', () => {
    expect(containsRect(wall, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  });

  it('rejects a rect hanging off an edge', () => {
    expect(containsRect(wall, { x: 95, y: 10, width: 10, height: 10 })).toBe(false);
  });
});

describe('toSvgY', () => {
  it('flips wall-space Y into SVG top-down space', () => {
    expect(toSvgY(96, 0)).toBe(96);
    expect(toSvgY(96, 96)).toBe(0);
    expect(toSvgY(96, 60)).toBe(36);
  });

  it('round-trips', () => {
    expect(toSvgY(96, toSvgY(96, 42))).toBe(42);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/layout-engine/src/geometry.test.ts`
Expected: FAIL — cannot resolve `./geometry.js`.

- [ ] **Step 3: Implement**

`packages/layout-engine/src/geometry.ts`:

```ts
/** Wall space: inches, origin at the wall's bottom-left corner, Y increasing upward. */
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** `x`/`y` is the bottom-left corner in wall space. */
export interface Rect extends Size {
  x: number;
  y: number;
}

export function outerSize(poster: {
  width: number;
  height: number;
  frameWidth: number;
}): Size {
  return {
    width: poster.width + poster.frameWidth * 2,
    height: poster.height + poster.frameWidth * 2,
  };
}

export function rectFromCenter(center: Point, size: Size): Rect {
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

/** Strict intersection — rects that merely share an edge do not overlap. */
export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export function containsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Converts wall-space Y (origin bottom-left, Y up) to SVG Y (origin top-left,
 * Y down). This is the single Y-flip in the codebase — no other module may
 * invert Y.
 */
export function toSvgY(wallHeight: number, y: number): number {
  return wallHeight - y;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/layout-engine`
Expected: PASS, 22 tests total across both files (10 in `units.test.ts`, 12 in `geometry.test.ts`).

- [ ] **Step 5: Export and commit**

`packages/layout-engine/src/index.ts`:

```ts
export * from './units.js';
export * from './geometry.js';
```

```bash
git add packages/layout-engine
git commit -m "feat(layout-engine): add wall-space geometry primitives"
```

---

### Task 4: `shared` zod contracts

**Files:**
- Create: `packages/shared/src/ids.ts`, `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces zod schemas and their inferred types, used by both `api` (validation) and `app` (types):
  - `ObstructionSchema` / `Obstruction` — `{ id, kind, label, x, y, width, height }`, `kind` ∈ `'door' | 'window' | 'outlet' | 'generic'`.
  - `WallSchema` / `Wall` — `{ id, name, widthIn, heightIn, obstructions }`.
  - `PosterSchema` / `Poster` — `{ id, name, widthIn, heightIn, frameWidthIn, frameColor, imageKey? }`.
  - `PlacementSchema` / `Placement` — `{ posterId, centerX, centerY }`.
  - `VisibilitySchema` — `'private' | 'public'`.
  - `ProjectSchema` / `Project` — `{ id, name, visibility, version }`.
  - `CreateProjectSchema` — request body for project creation.

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CreateProjectSchema,
  ObstructionSchema,
  PlacementSchema,
  PosterSchema,
  WallSchema,
} from './schemas.js';

describe('PosterSchema', () => {
  const valid = {
    id: 'p1',
    name: 'Blade Runner',
    widthIn: 24,
    heightIn: 36,
    frameWidthIn: 1,
    frameColor: '#000000',
  };

  it('accepts a valid poster', () => {
    expect(PosterSchema.parse(valid)).toMatchObject({ name: 'Blade Runner' });
  });

  it('applies the spec defaults for frame width and color', () => {
    const parsed = PosterSchema.parse({
      id: 'p1', name: 'Akira', widthIn: 24, heightIn: 36,
    });
    expect(parsed.frameWidthIn).toBe(1);
    expect(parsed.frameColor).toBe('#000000');
  });

  it('requires a non-empty name', () => {
    expect(() => PosterSchema.parse({ ...valid, name: '' })).toThrow();
  });

  it('rejects non-positive dimensions', () => {
    expect(() => PosterSchema.parse({ ...valid, widthIn: 0 })).toThrow();
    expect(() => PosterSchema.parse({ ...valid, heightIn: -5 })).toThrow();
  });

  it('rejects a malformed frame color', () => {
    expect(() => PosterSchema.parse({ ...valid, frameColor: 'black' })).toThrow();
  });

  it('allows a zero-width frame', () => {
    expect(PosterSchema.parse({ ...valid, frameWidthIn: 0 }).frameWidthIn).toBe(0);
  });
});

describe('ObstructionSchema', () => {
  it('accepts every documented kind', () => {
    for (const kind of ['door', 'window', 'outlet', 'generic'] as const) {
      const parsed = ObstructionSchema.parse({
        id: 'o1', kind, label: 'x', x: 0, y: 0, width: 30, height: 80,
      });
      expect(parsed.kind).toBe(kind);
    }
  });

  it('rejects an unknown kind', () => {
    expect(() => ObstructionSchema.parse({
      id: 'o1', kind: 'skylight', label: 'x', x: 0, y: 0, width: 1, height: 1,
    })).toThrow();
  });

  it('permits an obstruction at the wall origin', () => {
    expect(ObstructionSchema.parse({
      id: 'o1', kind: 'door', label: 'Front', x: 0, y: 0, width: 32, height: 80,
    }).x).toBe(0);
  });
});

describe('WallSchema', () => {
  it('defaults obstructions to an empty array', () => {
    const wall = WallSchema.parse({
      id: 'w1', name: 'North', widthIn: 144, heightIn: 96,
    });
    expect(wall.obstructions).toEqual([]);
  });

  it('rejects a wall with no size', () => {
    expect(() => WallSchema.parse({
      id: 'w1', name: 'North', widthIn: 0, heightIn: 96,
    })).toThrow();
  });
});

describe('PlacementSchema', () => {
  it('accepts a negative center, since a poster may overhang while dragging', () => {
    expect(PlacementSchema.parse({ posterId: 'p1', centerX: -2, centerY: 10 }))
      .toMatchObject({ centerX: -2 });
  });
});

describe('CreateProjectSchema', () => {
  it('defaults visibility to private', () => {
    expect(CreateProjectSchema.parse({ name: 'Living Room' }).visibility)
      .toBe('private');
  });

  it('rejects an empty name', () => {
    expect(() => CreateProjectSchema.parse({ name: '' })).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/shared`
Expected: FAIL — cannot resolve `./schemas.js`.

- [ ] **Step 3: Implement**

`packages/shared/src/ids.ts`:

```ts
import { z } from 'zod';

/** IDs are opaque strings; the API generates them with crypto.randomUUID(). */
export const IdSchema = z.string().min(1).max(64);
```

`packages/shared/src/schemas.ts`:

```ts
import { z } from 'zod';
import { IdSchema } from './ids.js';

const PositiveInches = z.number().positive().finite();
const NonNegativeInches = z.number().nonnegative().finite();
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color');

export const ObstructionKindSchema = z.enum(['door', 'window', 'outlet', 'generic']);
export type ObstructionKind = z.infer<typeof ObstructionKindSchema>;

export const ObstructionSchema = z.object({
  id: IdSchema,
  kind: ObstructionKindSchema,
  label: z.string().max(80),
  /** Bottom-left corner in wall space. */
  x: z.number().finite(),
  y: z.number().finite(),
  width: PositiveInches,
  height: PositiveInches,
});
export type Obstruction = z.infer<typeof ObstructionSchema>;

export const WallSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  widthIn: PositiveInches,
  heightIn: PositiveInches,
  obstructions: z.array(ObstructionSchema).default([]),
});
export type Wall = z.infer<typeof WallSchema>;

export const PosterSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  widthIn: PositiveInches,
  heightIn: PositiveInches,
  frameWidthIn: NonNegativeInches.default(1),
  frameColor: HexColor.default('#000000'),
  imageKey: z.string().optional(),
});
export type Poster = z.infer<typeof PosterSchema>;

export const PlacementSchema = z.object({
  posterId: IdSchema,
  /** Center of the framed poster, in wall space. */
  centerX: z.number().finite(),
  centerY: z.number().finite(),
});
export type Placement = z.infer<typeof PlacementSchema>;

export const VisibilitySchema = z.enum(['private', 'public']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(200),
  visibility: VisibilitySchema,
  version: z.number().int().nonnegative(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  visibility: VisibilitySchema.default('private'),
});
export type CreateProject = z.infer<typeof CreateProjectSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/shared`
Expected: PASS, 14 tests.

- [ ] **Step 5: Export and commit**

`packages/shared/src/index.ts`:

```ts
export * from './ids.js';
export * from './schemas.js';
```

```bash
git add packages/shared
git commit -m "feat(shared): add zod contracts for walls, posters, and projects"
```

---

### Task 5: Hono API with health route and error handling

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/src/errors.ts`, `api/src/app.ts`, `api/src/lambda.ts`
- Test: `api/src/app.test.ts`

**Interfaces:**
- Consumes: `@pwe/shared`.
- Produces:
  - `createApp(): Hono` from `api/src/app.ts` — the whole API, with no Lambda coupling, so tests can exercise it via `app.request()`.
  - `ApiError` class and `errorHandler` from `api/src/errors.ts`.
  - `handler` from `api/src/lambda.ts` — the CDK entrypoint.

- [ ] **Step 1: Create the workspace**

`api/package.json`:

```json
{
  "name": "@pwe/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/lambda.ts",
  "dependencies": {
    "@pwe/shared": "*",
    "aws-jwt-verify": "^4.0.1",
    "hono": "^4.6.14",
    "zod": "^3.24.1"
  }
}
```

`api/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"],
  "references": [{ "path": "../packages/shared" }]
}
```

Run `npm install` to link the workspace.

- [ ] **Step 2: Write the failing tests**

`api/src/app.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { ApiError } from './errors.js';

/**
 * Routes that throw on purpose are mounted by the test, not by createApp —
 * production must not ship endpoints whose only job is to fail. Hono's
 * onError/notFound are configuration rather than routes, so handlers
 * registered after createApp still pass through them.
 */
function appWithThrowingRoutes() {
  const app = createApp();
  app.get('/__boom', () => {
    throw new ApiError(418, 'teapot', 'short and stout');
  });
  app.get('/__throw', () => {
    throw new Error('secret internal detail');
  });
  return app;
}

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await createApp().request('/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });
});

describe('error handling', () => {
  it('returns a uniform body for unknown routes', async () => {
    const res = await createApp().request('/nope');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });

  it('maps a thrown ApiError to its status and code', async () => {
    const res = await appWithThrowingRoutes().request('/__boom');
    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({
      error: { code: 'teapot', message: 'short and stout' },
    });
  });

  it('hides internal failures behind a generic 500', async () => {
    const res = await appWithThrowingRoutes().request('/__throw');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('internal_error');
    expect(body.error.message).not.toContain('secret');
  });
});

describe('CORS', () => {
  it('answers preflight with the configured origin', async () => {
    const res = await createApp().request('/health', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.test',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://example.test');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run api`
Expected: FAIL — cannot resolve `./app.js`.

- [ ] **Step 4: Implement the error module**

`api/src/errors.ts`:

```ts
import type { Context } from 'hono';

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 418 | 500,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFound = (c: Context) =>
  c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  // Never leak internal messages to the client; the details go to CloudWatch.
  console.error('unhandled error', err);
  return c.json(
    { error: { code: 'internal_error', message: 'Internal server error' } },
    500,
  );
}
```

- [ ] **Step 5: Implement the app**

`api/src/app.ts`:

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { errorHandler, notFound } from './errors.js';

export function createApp(): Hono {
  const app = new Hono();

  // Tokens are bearer, not cookies, so a permissive reflection is safe here.
  // Task 9 narrows this to the deployed web origin via the WEB_ORIGIN env var.
  app.use('*', cors({
    origin: (origin) => process.env.WEB_ORIGIN ?? origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }));

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.notFound(notFound);
  app.onError(errorHandler);

  return app;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run api`
Expected: PASS, 5 tests.

- [ ] **Step 7: Add the Lambda entrypoint and commit**

`api/src/lambda.ts`:

```ts
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.js';

export const handler = handle(createApp());
```

```bash
git add api
git commit -m "feat(api): add Hono app with health route and uniform errors"
```

---

### Task 6: CDK data and API stack

**Files:**
- Create: `infrastructure/package.json`, `infrastructure/tsconfig.json`, `infrastructure/cdk.json`
- Create: `infrastructure/bin/app.ts`, `infrastructure/lib/main-stack.ts`
- Create: `infrastructure/lib/constructs/data.ts`, `infrastructure/lib/constructs/api.ts`
- Test: `infrastructure/test/main-stack.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `api/src/lambda.ts` as the bundling entrypoint.
- Produces:
  - `class DataConstruct` exposing `readonly table: dynamodb.TableV2`.
  - `class ApiConstruct` exposing `readonly httpApi: apigwv2.HttpApi` and `readonly fn: NodejsFunction`.
  - `class MainStack` with a `stackName` of `PosterWalls`.
  - Stack outputs `ApiUrl` and `TableName`.

- [ ] **Step 1: Create the workspace**

`infrastructure/package.json`:

```json
{
  "name": "@pwe/infrastructure",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "synth": "cdk synth",
    "deploy": "cdk deploy --require-approval never"
  },
  "dependencies": {
    "aws-cdk-lib": "^2.173.2",
    "constructs": "^10.4.2"
  },
  "devDependencies": {
    "aws-cdk": "^2.173.2"
  }
}
```

`infrastructure/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": ".", "composite": false },
  "include": ["bin", "lib", "test"]
}
```

`infrastructure/cdk.json`:

```json
{
  "app": "npx tsx bin/app.ts",
  "context": {
    "@aws-cdk/customresources:installLatestAwsSdkDefault": false
  }
}
```

Add `tsx` to the root devDependencies, then run `npm install`.

- [ ] **Step 2: Write the failing test**

`infrastructure/test/main-stack.test.ts`:

```ts
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { MainStack } from '../lib/main-stack.js';

function synth() {
  const app = new App();
  const stack = new MainStack(app, 'TestStack', {
    env: { account: '111111111111', region: 'us-east-1' },
    useCustomDomain: false,
  });
  return Template.fromStack(stack);
}

describe('MainStack', () => {
  it('creates a single on-demand table with PITR', () => {
    const t = synth();
    t.resourceCountIs('AWS::DynamoDB::GlobalTable', 1);
    t.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
    });
  });

  it('runs the API Lambda on arm64 Node 22', () => {
    synth().hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
    });
  });

  it('exposes an HTTP API', () => {
    const t = synth();
    t.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    t.hasResourceProperties('AWS::ApiGatewayV2::Api', { ProtocolType: 'HTTP' });
  });

  it('grants the Lambda access to the table', () => {
    // CDK's Template matchers are its own — vitest's expect.arrayContaining
    // is an unrelated asymmetric matcher that hasResourceProperties would
    // deep-compare as a literal object and never match.
    synth().hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: Match.arrayWith(['dynamodb:GetItem']) }),
        ]),
      }),
    });
  });

  it('publishes the API URL and table name as outputs', () => {
    const outputs = synth().findOutputs('*');
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining(['ApiUrl', 'TableName']),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run infrastructure`
Expected: FAIL — cannot resolve `../lib/main-stack.js`.

- [ ] **Step 4: Implement the data construct**

`infrastructure/lib/constructs/data.ts`:

```ts
import { RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * Single-table store. Every access pattern in the spec resolves from the
 * partition key, so there are no secondary indexes.
 */
export class DataConstruct extends Construct {
  readonly table: dynamodb.TableV2;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.table = new dynamodb.TableV2(this, 'Table', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
```

- [ ] **Step 5: Implement the API construct**

`infrastructure/lib/constructs/api.ts`:

```ts
import { Duration } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export interface ApiConstructProps {
  readonly table: dynamodb.TableV2;
}

export class ApiConstruct extends Construct {
  readonly httpApi: apigwv2.HttpApi;
  readonly fn: NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    this.fn = new NodejsFunction(this, 'Fn', {
      entry: fileURLToPath(new URL('../../../api/src/lambda.ts', import.meta.url)),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        TABLE_NAME: props.table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: { minify: true, sourceMap: true },
    });

    props.table.grantReadWriteData(this.fn);

    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      // Hono owns CORS so preflight and actual responses stay consistent.
      defaultIntegration: new HttpLambdaIntegration('Default', this.fn),
    });
  }
}
```

- [ ] **Step 6: Implement the stack and entrypoint**

`infrastructure/lib/main-stack.ts`:

```ts
import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ApiConstruct } from './constructs/api.js';
import { DataConstruct } from './constructs/data.js';

export interface MainStackProps extends StackProps {
  /** Custom domain stays off until Namecheap NS delegation lands (Plan 4). */
  readonly useCustomDomain: boolean;
}

export class MainStack extends Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    const data = new DataConstruct(this, 'Data');
    const api = new ApiConstruct(this, 'Api', { table: data.table });

    new CfnOutput(this, 'ApiUrl', { value: api.httpApi.apiEndpoint });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
  }
}
```

`infrastructure/bin/app.ts`:

```ts
#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { MainStack } from '../lib/main-stack.js';

const app = new App();

new MainStack(app, 'PosterWalls', {
  stackName: 'PosterWalls',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  useCustomDomain: false,
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run infrastructure`
Expected: PASS, 5 tests.
Then: `cd infrastructure && npx cdk synth --quiet`
Expected: exits 0, writes `cdk.out/`.

- [ ] **Step 8: Add synth to CI and commit**

Append to the `verify` job in `.github/workflows/ci.yml`:

```yaml
      - run: npx cdk synth --quiet
        working-directory: infrastructure
```

```bash
git add infrastructure .github/workflows/ci.yml
git commit -m "feat(infra): add DynamoDB table and Hono Lambda behind an HTTP API"
```

---

### Task 7: CDK web hosting and Cognito

**Files:**
- Create: `infrastructure/lib/constructs/web.ts`, `infrastructure/lib/constructs/auth.ts`
- Modify: `infrastructure/lib/main-stack.ts`
- Modify: `infrastructure/test/main-stack.test.ts`

**Interfaces:**
- Consumes: `MainStack` from Task 6.
- Produces:
  - `class WebConstruct` exposing `readonly distribution: cloudfront.Distribution`, `readonly webBucket: s3.Bucket`, `readonly imagesBucket: s3.Bucket`.
  - `class AuthConstruct` exposing `readonly userPool: cognito.UserPool`, `readonly client: cognito.UserPoolClient`, `readonly domainPrefix: string`.
  - New stack outputs: `WebUrl`, `WebBucketName`, `DistributionId`, `UserPoolId`, `UserPoolClientId`, `CognitoDomain`.

- [ ] **Step 1: Write the failing tests**

Append to `infrastructure/test/main-stack.test.ts`:

```ts
describe('web hosting', () => {
  it('creates a CloudFront distribution that rewrites SPA 403/404 to index.html', () => {
    const t = synth();
    t.resourceCountIs('AWS::CloudFront::Distribution', 1);
    t.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
        ]),
      }),
    });
  });

  it('creates two buckets, both blocking public access', () => {
    const t = synth();
    t.resourceCountIs('AWS::S3::Bucket', 2);
    for (const bucket of Object.values(t.findResources('AWS::S3::Bucket'))) {
      expect(bucket.Properties.PublicAccessBlockConfiguration).toEqual({
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      });
    }
  });
});

describe('auth', () => {
  it('creates a user pool that signs in by email and self-verifies it', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
    });
  });

  it('creates a public client with no secret, using authorization code + PKCE', () => {
    synth().hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AllowedOAuthFlows: ['code'],
    });
  });

  it('publishes the auth outputs the SPA build needs', () => {
    const outputs = synth().findOutputs('*');
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining([
        'WebUrl', 'WebBucketName', 'DistributionId',
        'UserPoolId', 'UserPoolClientId', 'CognitoDomain',
      ]),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run infrastructure`
Expected: FAIL — 0 CloudFront distributions found, 0 buckets.

- [ ] **Step 3: Implement the web construct**

`infrastructure/lib/constructs/web.ts`:

```ts
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export class WebConstruct extends Construct {
  readonly webBucket: s3.Bucket;
  readonly imagesBucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    const bucketDefaults = {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    } as const;

    this.webBucket = new s3.Bucket(this, 'WebBucket', {
      ...bucketDefaults,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Poster images. Retained because deleting them would break saved
    // arrangements and any share link already handed out.
    this.imagesBucket = new s3.Bucket(this, 'ImagesBucket', {
      ...bucketDefaults,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [{
        allowedMethods: [s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000,
      }],
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/i/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.imagesBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      // The SPA owns routing, so unknown paths must return index.html rather
      // than S3's 403/404.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
      ],
    });
  }
}
```

- [ ] **Step 4: Implement the auth construct**

`infrastructure/lib/constructs/auth.ts`:

```ts
import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthConstructProps {
  /** Callback/logout origins. CloudFront URL now; custom domain in Plan 4. */
  readonly webOrigins: string[];
}

export class AuthConstruct extends Construct {
  readonly userPool: cognito.UserPool;
  readonly client: cognito.UserPoolClient;
  readonly domainPrefix: string;

  constructor(scope: Construct, id: string, props: AuthConstructProps) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      passwordPolicy: { minLength: 12, requireDigits: true, requireLowercase: true, requireUppercase: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.client = this.userPool.addClient('WebClient', {
      // Public SPA client: no secret, authorization code + PKCE.
      generateSecret: false,
      authFlows: { userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: props.webOrigins.map((o) => `${o}/callback`),
        logoutUrls: props.webOrigins,
      },
      preventUserExistenceErrors: true,
    });

    this.domainPrefix = `poster-walls-${Stack.of(this).account}`;
    this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: this.domainPrefix },
    });
  }
}
```

- [ ] **Step 5: Wire both into the stack**

Replace the body of `MainStack`'s constructor in `infrastructure/lib/main-stack.ts`:

```ts
    const data = new DataConstruct(this, 'Data');
    const web = new WebConstruct(this, 'Web');

    const webUrl = `https://${web.distribution.distributionDomainName}`;
    const auth = new AuthConstruct(this, 'Auth', {
      webOrigins: [webUrl, 'http://localhost:5173'],
    });

    const api = new ApiConstruct(this, 'Api', { table: data.table });
    api.fn.addEnvironment('USER_POOL_ID', auth.userPool.userPoolId);
    api.fn.addEnvironment('USER_POOL_CLIENT_ID', auth.client.userPoolClientId);
    api.fn.addEnvironment('WEB_ORIGIN', webUrl);
    api.fn.addEnvironment('IMAGES_BUCKET', web.imagesBucket.bucketName);

    new CfnOutput(this, 'ApiUrl', { value: api.httpApi.apiEndpoint });
    new CfnOutput(this, 'TableName', { value: data.table.tableName });
    new CfnOutput(this, 'WebUrl', { value: webUrl });
    new CfnOutput(this, 'WebBucketName', { value: web.webBucket.bucketName });
    new CfnOutput(this, 'DistributionId', { value: web.distribution.distributionId });
    new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: auth.client.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', {
      value: `https://${auth.domainPrefix}.auth.${this.region}.amazoncognito.com`,
    });
```

Add the two imports at the top:

```ts
import { AuthConstruct } from './constructs/auth.js';
import { WebConstruct } from './constructs/web.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run infrastructure`
Expected: PASS, 10 tests.

- [ ] **Step 7: Commit**

```bash
git add infrastructure
git commit -m "feat(infra): add CloudFront hosting, image bucket, and Cognito"
```

---

### Task 8: Bootstrap stack for GitHub OIDC, and first deploy

**Files:**
- Create: `infrastructure/lib/bootstrap-stack.ts`
- Modify: `infrastructure/bin/app.ts`
- Test: `infrastructure/test/bootstrap-stack.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a `PosterWallsBootstrap` stack exporting output `DeployRoleArn`. Deployed **manually, once**, from the local IAM user — GitHub cannot deploy it, because it is what grants GitHub the ability to deploy.

- [ ] **Step 1: Write the failing test**

`infrastructure/test/bootstrap-stack.test.ts`:

```ts
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { BootstrapStack } from '../lib/bootstrap-stack.js';

function synth() {
  const app = new App();
  const stack = new BootstrapStack(app, 'TestBootstrap', {
    env: { account: '111111111111', region: 'us-east-1' },
    githubOwner: 'CrispyCabot',
    githubRepo: 'poster-walls-editor',
  });
  return Template.fromStack(stack);
}

describe('BootstrapStack', () => {
  it('registers the GitHub OIDC provider', () => {
    synth().resourceCountIs('Custom::AWSCDKOpenIdConnectProvider', 1);
  });

  it('scopes role assumption to this repository only', () => {
    const roles = synth().findResources('AWS::IAM::Role');
    const doc = JSON.stringify(Object.values(roles)[0]?.Properties.AssumeRolePolicyDocument);
    expect(doc).toContain('repo:CrispyCabot/poster-walls-editor:*');
    expect(doc).toContain('sts.amazonaws.com');
  });

  it('publishes the role ARN', () => {
    expect(Object.keys(synth().findOutputs('*'))).toContain('DeployRoleArn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run infrastructure/test/bootstrap-stack.test.ts`
Expected: FAIL — cannot resolve `../lib/bootstrap-stack.js`.

- [ ] **Step 3: Implement**

`infrastructure/lib/bootstrap-stack.ts`:

```ts
import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BootstrapStackProps extends StackProps {
  readonly githubOwner: string;
  readonly githubRepo: string;
}

/**
 * Deployed once, manually, from a local admin identity. It is what allows
 * GitHub Actions to deploy everything else, so it cannot itself be deployed
 * by GitHub Actions.
 */
export class BootstrapStack extends Stack {
  constructor(scope: Construct, id: string, props: BootstrapStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new iam.Role(this, 'DeployRole', {
      roleName: 'PosterWallsGithubDeploy',
      // Restricted to this repository. Any branch may deploy; the workflow
      // itself only runs the deploy job on main.
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          'token.actions.githubusercontent.com:sub':
            `repo:${props.githubOwner}/${props.githubRepo}:*`,
        },
      }),
      // CDK deploys assume the CDK bootstrap roles, which requires admin-level
      // reach. Narrowing this is tracked as future work.
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
```

Append to `infrastructure/bin/app.ts`:

```ts
new BootstrapStack(app, 'PosterWallsBootstrap', {
  stackName: 'PosterWallsBootstrap',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  githubOwner: 'CrispyCabot',
  githubRepo: 'poster-walls-editor',
});
```

with the import `import { BootstrapStack } from '../lib/bootstrap-stack.js';`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run infrastructure`
Expected: PASS, 13 tests.

- [ ] **Step 5: Bootstrap the CDK environment and deploy both stacks**

```bash
cd infrastructure
npx cdk bootstrap aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1
npx cdk deploy PosterWallsBootstrap --require-approval never
npx cdk deploy PosterWalls --require-approval never
```

Expected: both stacks reach `CREATE_COMPLETE`. Record the outputs:

```bash
aws cloudformation describe-stacks --stack-name PosterWalls \
  --query "Stacks[0].Outputs" --output table
```

- [ ] **Step 6: Verify the deployed API answers**

```bash
API=$(aws cloudformation describe-stacks --stack-name PosterWalls \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
curl -s "$API/health"
```

Expected: `{"status":"ok"}`.

- [ ] **Step 7: Store the role ARN as a repository secret**

```bash
ROLE=$(aws cloudformation describe-stacks --stack-name PosterWallsBootstrap \
  --query "Stacks[0].Outputs[?OutputKey=='DeployRoleArn'].OutputValue" --output text)
gh secret set AWS_DEPLOY_ROLE_ARN --body "$ROLE"
gh variable set AWS_REGION --body "us-east-1"
```

Verify with `gh secret list` and `gh variable list`. The ARN must never be committed.

- [ ] **Step 8: Commit**

```bash
git add infrastructure
git commit -m "feat(infra): add GitHub OIDC bootstrap stack"
```

---

### Task 9: React SPA with Cognito login

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html`
- Create: `app/src/main.tsx`, `app/src/config.ts`, `app/src/auth/oidc.ts`, `app/src/auth/AuthProvider.tsx`
- Create: `app/src/routes/Callback.tsx`, `app/src/routes/Home.tsx`
- Create: `app/.env.example`
- Test: `app/src/config.test.ts`

**Interfaces:**
- Consumes: stack outputs from Task 8 as `VITE_*` env vars.
- Produces:
  - `config` object from `app/src/config.ts` — `{ apiUrl, cognitoDomain, userPoolClientId, redirectUri }`.
  - `useAuth()` hook returning `{ user, accessToken, signIn, signOut, status }`.

- [ ] **Step 1: Create the workspace**

`app/package.json`:

```json
{
  "name": "@pwe/app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@pwe/layout-engine": "*",
    "@pwe/shared": "*",
    "oidc-client-ts": "^3.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.1.1"
  },
  "devDependencies": {
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^6.0.7"
  }
}
```

`app/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
});
```

`app/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "noEmit": true,
    "composite": false,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`app/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Poster Walls Editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Run `npm install`.

- [ ] **Step 2: Write the failing config test**

`app/src/config.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app`
Expected: FAIL — cannot resolve `./config.js`.

- [ ] **Step 4: Implement config**

`app/src/config.ts`:

```ts
export interface AppConfig {
  apiUrl: string;
  cognitoDomain: string;
  userPoolClientId: string;
  redirectUri: string;
}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new Error(
      `Missing ${name}. It is injected at build time from CloudFormation outputs; ` +
        `for local dev copy app/.env.example to app/.env.local and fill it in.`,
    );
  }
  return value;
}

export function loadConfig(origin: string): AppConfig {
  const env = import.meta.env;
  return {
    apiUrl: required('VITE_API_URL', env.VITE_API_URL).replace(/\/$/, ''),
    cognitoDomain: required('VITE_COGNITO_DOMAIN', env.VITE_COGNITO_DOMAIN).replace(/\/$/, ''),
    userPoolClientId: required('VITE_USER_POOL_CLIENT_ID', env.VITE_USER_POOL_CLIENT_ID),
    redirectUri: `${origin}/callback`,
  };
}

let cached: AppConfig | null = null;

/**
 * Resolved lazily. A module-level `loadConfig(window.location.origin)` would
 * run on import and blow up under vitest's node environment, where `window`
 * does not exist — importing a module always evaluates it, even when the test
 * only names one export.
 */
export function getConfig(): AppConfig {
  cached ??= loadConfig(window.location.origin);
  return cached;
}
```

`app/.env.example`:

```
VITE_API_URL=
VITE_COGNITO_DOMAIN=
VITE_USER_POOL_CLIENT_ID=
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app`
Expected: PASS, 3 tests.

- [ ] **Step 6: Implement auth**

`app/src/auth/oidc.ts`:

```ts
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { getConfig } from '../config.js';

const config = getConfig();

export const userManager = new UserManager({
  authority: config.cognitoDomain,
  // Cognito does not serve OIDC discovery at the Hosted UI domain, so the
  // endpoints are declared explicitly.
  metadata: {
    issuer: config.cognitoDomain,
    authorization_endpoint: `${config.cognitoDomain}/oauth2/authorize`,
    token_endpoint: `${config.cognitoDomain}/oauth2/token`,
    userinfo_endpoint: `${config.cognitoDomain}/oauth2/userInfo`,
    end_session_endpoint: `${config.cognitoDomain}/logout`,
  },
  client_id: config.userPoolClientId,
  redirect_uri: config.redirectUri,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid email profile',
  userStore: new WebStorageStateStore({ store: window.localStorage }),
});
```

`app/src/auth/AuthProvider.tsx`:

```tsx
import type { User } from 'oidc-client-ts';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { userManager } from './oidc.js';

type Status = 'loading' | 'signed-in' | 'signed-out';

interface AuthValue {
  user: User | null;
  accessToken: string | null;
  status: Status;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    userManager
      .getUser()
      .then((found) => {
        setUser(found);
        setStatus(found ? 'signed-in' : 'signed-out');
      })
      .catch(() => setStatus('signed-out'));
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      accessToken: user?.access_token ?? null,
      status,
      signIn: () => userManager.signinRedirect(),
      signOut: () => userManager.signoutRedirect(),
    }),
    [user, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
```

- [ ] **Step 7: Implement routes and entrypoint**

`app/src/routes/Callback.tsx`:

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { userManager } from '../auth/oidc.js';

export function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    userManager
      .signinRedirectCallback()
      .then(() => navigate('/', { replace: true }))
      .catch(() => navigate('/', { replace: true }));
  }, [navigate]);

  return <p>Signing you in…</p>;
}
```

`app/src/routes/Home.tsx`:

```tsx
import { useAuth } from '../auth/AuthProvider.js';

export function Home() {
  const { status, user, signIn, signOut } = useAuth();

  if (status === 'loading') return <p>Loading…</p>;

  if (status === 'signed-out') {
    return (
      <main>
        <h1>Poster Walls Editor</h1>
        <button onClick={() => void signIn()}>Sign in</button>
      </main>
    );
  }

  return (
    <main>
      <h1>Poster Walls Editor</h1>
      <p>Signed in as {user?.profile.email}</p>
      <button onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
```

`app/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.js';
import { Callback } from './routes/Callback.js';
import { Home } from './routes/Home.js';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/callback" element={<Callback />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 8: Verify the build and commit**

```bash
cd app
VITE_API_URL=https://x VITE_COGNITO_DOMAIN=https://y VITE_USER_POOL_CLIENT_ID=z npm run build
```

Expected: build succeeds, `app/dist/index.html` exists.

```bash
git add app
git commit -m "feat(app): add React SPA with Cognito PKCE login"
```

---

### Task 10: JWT verification and `/me`

**Files:**
- Create: `api/src/auth.ts`
- Test: `api/src/auth.test.ts`
- Modify: `api/src/app.ts`
- Modify: `app/src/routes/Home.tsx`

**Interfaces:**
- Consumes: `ApiError` from Task 5; `useAuth()` from Task 9.
- Produces:
  - `type TokenVerifier = (token: string) => Promise<{ sub: string; username: string }>`
  - `createAuthMiddleware(verify: TokenVerifier)` — Hono middleware setting `c.get('user')`.
  - `cognitoVerifier(): TokenVerifier` — the production implementation.
  - `createApp` gains an optional parameter: `createApp(deps?: { verify?: TokenVerifier }): Hono`. The no-argument call from Task 5 keeps working.
  - `GET /me` returning `{ sub, username }`.

Verification is injected rather than constructed inside the middleware, so tests
exercise the real middleware with a fake verifier and never need a live user
pool. Note the middleware verifies the **access** token, whose payload carries
`sub` and `username` but **not** `email` — email lives in the ID token, and the
SPA already has it from the OIDC profile.

- [ ] **Step 1: Write the failing tests**

`api/src/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

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
    const body = await res.json();
    expect(body.error.message).toBe('Invalid token');
    expect(body.error.message).not.toContain('bad token');
  });
});

describe('unauthenticated routes', () => {
  it('leaves /health open', async () => {
    expect((await app().request('/health')).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/src/auth.test.ts`
Expected: FAIL — `createApp` takes no arguments and `/me` returns 404.

- [ ] **Step 3: Implement the middleware**

`api/src/auth.ts`:

```ts
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createMiddleware } from 'hono/factory';
import { ApiError } from './errors.js';

export interface AuthedUser {
  sub: string;
  username: string;
}

export type TokenVerifier = (token: string) => Promise<AuthedUser>;

export type AuthedEnv = { Variables: { user: AuthedUser } };

export function createAuthMiddleware(verify: TokenVerifier) {
  return createMiddleware<AuthedEnv>(async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new ApiError(401, 'unauthorized', 'Missing bearer token');
    }

    let user: AuthedUser;
    try {
      user = await verify(header.slice('Bearer '.length));
    } catch {
      // Deliberately opaque: the caller learns the token failed, not how.
      throw new ApiError(401, 'unauthorized', 'Invalid token');
    }

    c.set('user', user);
    await next();
  });
}

/** Production verifier. Built once per container, then reused. */
export function cognitoVerifier(): TokenVerifier {
  const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.USER_POOL_ID ?? '',
    tokenUse: 'access',
    clientId: process.env.USER_POOL_CLIENT_ID ?? '',
  });

  return async (token) => {
    const payload = await verifier.verify(token);
    return { sub: payload.sub, username: String(payload.username) };
  };
}
```

- [ ] **Step 4: Wire it into the app**

In `api/src/app.ts`, add the imports:

```ts
import { type AuthedEnv, cognitoVerifier, createAuthMiddleware, type TokenVerifier } from './auth.js';
```

Change the signature and add the route. Replace `export function createApp(): Hono {` with:

```ts
export interface AppDeps {
  /** Injected by tests; production builds the Cognito verifier lazily. */
  verify?: TokenVerifier;
}

export function createApp(deps: AppDeps = {}): Hono {
```

Then, immediately after the `/health` route, add:

```ts
  const requireAuth = createAuthMiddleware(deps.verify ?? cognitoVerifier());

  app.get('/me', requireAuth, (c) => {
    const { sub, username } = (c as unknown as { get(k: 'user'): AuthedUser }).get('user');
    return c.json({ sub, username });
  });
```

with `AuthedUser` added to the auth import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run api`
Expected: PASS, 10 tests across `app.test.ts` and `auth.test.ts`.

- [ ] **Step 6: Call `/me` from the SPA**

Replace `app/src/routes/Home.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { getConfig } from '../config.js';

interface Me {
  sub: string;
  username: string;
}

export function Home() {
  const { status, user, accessToken, signIn, signOut } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken === null) return;
    fetch(`${getConfig().apiUrl}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        setMe((await res.json()) as Me);
      })
      .catch((err: Error) => setMeError(err.message));
  }, [accessToken]);

  if (status === 'loading') return <p>Loading…</p>;

  if (status === 'signed-out') {
    return (
      <main>
        <h1>Poster Walls Editor</h1>
        <button onClick={() => void signIn()}>Sign in</button>
      </main>
    );
  }

  return (
    <main>
      <h1>Poster Walls Editor</h1>
      <p>Signed in as {user?.profile.email}</p>
      {meError !== null && <p role="alert">API check failed: {meError}</p>}
      {me !== null && <p>API confirmed identity: {me.username}</p>}
      <button onClick={() => void signOut()}>Sign out</button>
    </main>
  );
}
```

This is the only thing in the plan that proves the access token the browser
holds is actually accepted by the API — browser-side login succeeding says
nothing about server-side verification.

- [ ] **Step 7: Commit**

```bash
git add api app
git commit -m "feat(api): verify Cognito access tokens and add /me"
```

---

### Task 11: Deploy workflow and end-to-end verification

**Files:**
- Create: `.github/workflows/deploy.yml`
- Test: manual verification against the deployed site.

**Interfaces:**
- Consumes: `AWS_DEPLOY_ROLE_ARN` secret and `AWS_REGION` variable from Task 8; every workspace from Tasks 1-10.
- Produces: a working signup-and-login flow on the CloudFront URL.

- [ ] **Step 1: Write the deploy workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      # Phase 1 — infrastructure. The SPA build needs values that only exist
      # after this completes.
      - name: Deploy infrastructure
        run: npx cdk deploy PosterWalls --require-approval never
        working-directory: infrastructure

      # Phase 2 — read outputs, build the SPA against them, publish.
      - name: Read stack outputs
        id: outputs
        run: |
          read_output() {
            aws cloudformation describe-stacks --stack-name PosterWalls \
              --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
          }
          {
            echo "api_url=$(read_output ApiUrl)"
            echo "cognito_domain=$(read_output CognitoDomain)"
            echo "client_id=$(read_output UserPoolClientId)"
            echo "web_bucket=$(read_output WebBucketName)"
            echo "distribution_id=$(read_output DistributionId)"
            echo "web_url=$(read_output WebUrl)"
          } >> "$GITHUB_OUTPUT"

      - name: Build SPA
        run: npm run build --workspace @pwe/app
        env:
          VITE_API_URL: ${{ steps.outputs.outputs.api_url }}
          VITE_COGNITO_DOMAIN: ${{ steps.outputs.outputs.cognito_domain }}
          VITE_USER_POOL_CLIENT_ID: ${{ steps.outputs.outputs.client_id }}

      - name: Publish
        run: |
          aws s3 sync app/dist "s3://${{ steps.outputs.outputs.web_bucket }}" --delete
          aws cloudfront create-invalidation \
            --distribution-id "${{ steps.outputs.outputs.distribution_id }}" \
            --paths '/*'

      - name: Summary
        run: echo "Deployed ${{ steps.outputs.outputs.web_url }}" >> "$GITHUB_STEP_SUMMARY"
```

`index.html` is synced with `--delete` after the hashed assets, and CloudFront is invalidated immediately, so the window where a stale `index.html` could reference a deleted bundle is limited to the invalidation itself.

- [ ] **Step 2: Commit and push, then watch the deploy**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add two-phase deploy workflow using OIDC"
git push
gh run watch
```

Expected: the Deploy workflow succeeds. If `configure-aws-credentials` fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity`, the `sub` condition in the bootstrap stack does not match this repository — re-check the owner and repo names in Task 8.

- [ ] **Step 3: Verify the deployed API**

```bash
API=$(aws cloudformation describe-stacks --stack-name PosterWalls \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
curl -s "$API/health"
```

Expected: `{"status":"ok"}`.

- [ ] **Step 4: Verify login end-to-end in a browser**

Open the `WebUrl` output. Then:

1. Click **Sign in** — you should land on the Cognito Managed Login page.
2. Create an account with a real email address.
3. Enter the emailed verification code.
4. You should be redirected to `/callback` and then to `/`, showing "Signed in as <your email>".
5. **"API confirmed identity: <username>" must also appear.** This is the load-bearing assertion — it proves the API verified the access token server-side. If you see "API check failed" instead, the browser session is fine but JWT verification is broken; check `USER_POOL_ID` and `USER_POOL_CLIENT_ID` on the Lambda and the CORS origin.
6. Reload the page — you should remain signed in.
7. Click **Sign out** — you should return to the signed-out view.

Confirm the user exists:

```bash
POOL=$(aws cloudformation describe-stacks --stack-name PosterWalls \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
aws cognito-idp list-users --user-pool-id "$POOL" --query "Users[].Username"
```

Expected: your account appears.

- [ ] **Step 5: Verify a direct deep link loads**

Open `<WebUrl>/callback` directly in a fresh tab.
Expected: the SPA loads rather than an S3 404, confirming the CloudFront error-response rewrite works.

- [ ] **Step 6: Record completion**

```bash
git commit --allow-empty -m "chore: foundation deployed and verified end-to-end"
git push
```

---

## Definition of Done

- [ ] `npm run typecheck`, `npm run test`, and `npm run build` all pass from the repo root.
- [ ] CI is green on `main`.
- [ ] The Deploy workflow completes without manual intervention.
- [ ] `GET <ApiUrl>/health` returns `{"status":"ok"}`.
- [ ] `GET <ApiUrl>/me` without a token returns 401; with a valid access token it returns the caller's `sub` and `username`.
- [ ] A real user can sign up, verify by email, sign in, persist a reload, and sign out.
- [ ] The signed-in page shows "API confirmed identity", proving server-side token verification works.
- [ ] A deep link to `/callback` loads the SPA rather than an S3 error.
- [ ] No AWS account ID appears in any committed file: `git grep -c '[0-9]\{12\}'` finds nothing.
- [ ] `packages/layout-engine` imports nothing from React, the DOM, or the AWS SDK.

## Deferred to later plans

Recorded so the omissions are visible rather than forgotten:

- **Nothing reads or writes DynamoDB.** The table exists and the Lambda holds read/write grants and `TABLE_NAME`, but the first persisted entity — projects — arrives in Plan 2. `/me` is served entirely from the verified token.
- **CORS reflects the request origin** when `WEB_ORIGIN` is unset. `WEB_ORIGIN` is set in the deployed stack, so production is already pinned to the CloudFront URL.
- **The deploy role holds `AdministratorAccess`.** CDK deployments assume the CDK bootstrap roles, which need broad reach; scoping this down is worth revisiting once the resource set stops changing.
- **The image processing Lambda does not exist.** The images bucket and the `/i/*` CloudFront behavior are provisioned; the sharp pipeline lands in Plan 2.
- **Custom domain, Route53, and ACM** are entirely absent, per the plan-wide constraint. Plan 4.
