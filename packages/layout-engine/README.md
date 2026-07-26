# @pwe/layout-engine

All the geometry that decides where a poster sits on a wall — and every number
that would be wrong if the math were wrong.

**This package imports nothing.** No React, no DOM, no AWS SDK, no npm
packages. Pure functions only. That is deliberate and load-bearing: it means
the trickiest logic in the project is testable with plain unit tests, and the
same functions that position a poster on screen produce the nail coordinates on
the printed hang sheet.

## Wall space

One coordinate system, used everywhere:

- Origin at the wall's **bottom-left** corner
- **Y increases upward**
- All units are **inches**

This matches how hanging is actually described — "62 inches from the floor" —
so hang-sheet numbers need no conversion.

`Rect.x`/`Rect.y` is the **bottom-left** corner. Placements store the **center**
of the framed poster, which makes centre-alignment and equal-spacing math
natural.

SVG draws with Y pointing down, so exactly one function — `toSvgY` — performs
that flip. Nothing else in the codebase may invert Y.

## What's here

```
src/
  units.ts      inch and feet-inches formatting, and parsing back to inches
  geometry.ts   Point, Size, Rect, overlap and containment tests, the Y flip
```

Still to come: snapping and alignment guides, overlap detection against
obstructions, auto-arrange presets, and hang-sheet coordinates.

## Testing

From the repo root:

```bash
npx vitest run packages/layout-engine
```
