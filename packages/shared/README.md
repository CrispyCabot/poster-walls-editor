# @pwe/shared

The API contract. [zod](https://zod.dev) schemas imported by both `api` (to
validate requests) and `app` (to derive types), so the two cannot drift apart.

## What's here

```
src/
  ids.ts       opaque ID type
  schemas.ts   Obstruction, Wall, Poster, Placement, Project, CreateProject
```

## Output types vs input types

Each schema with defaulted fields exports **two** types:

```ts
Poster          // parsed form  — defaulted fields are present
PosterInput     // request form — defaulted fields may be omitted
```

This matters more than it looks. `z.infer` resolves to zod's *output* type,
where a `.default()` field is **required** — so typing a request body as
`Poster` would reject an object that omits `frameWidthIn`, which is the exact
omission the default exists to serve. Use the `*Input` alias when constructing
a request; use the plain type for parsed data.

Aliases exist for every schema that owns a default: `WallInput`, `PosterInput`,
`CreateProjectInput`.

Note these are **compile-time** guarantees. Vitest transpiles without type
checking, so `npm test` alone will not catch a regression here — `npm run
typecheck` is what enforces it.

## Unit suffixes

Every coordinate and dimension field here carries an explicit `In` suffix
(`widthIn`, `xIn`, `centerXIn`, ...) because this is the **persisted**
contract — the field name is the only place a reader learns the unit.
`packages/layout-engine`'s `Rect`/`Point`/`Size` deliberately do **not**
follow this convention: that module is internal, documents its inch
convention once in its own README, and uses plain geometry names (`x`,
`width`, `y`). Do not "fix" that inconsistency — it is a boundary, not a
mistake.

## Defaults

Set by the product spec:

| Field | Default |
|---|---|
| `Poster.frameWidthIn` | `1` inch |
| `Poster.frameColor` | `#000000` |
| `Wall.obstructions` | `[]` |
| `CreateProject.visibility` | `private` |

## Testing

From the repo root:

```bash
npx vitest run packages/shared
```
