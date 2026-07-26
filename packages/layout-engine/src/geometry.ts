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
