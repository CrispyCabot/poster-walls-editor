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

/** Exact inverse of `wallToScreen`. Turns pointer positions into inches. */
export function screenToWall(point: Point, wall: Size, fit: Fit): Point {
  const svgY = (point.y - fit.offsetY) / fit.scale;
  return {
    x: (point.x - fit.offsetX) / fit.scale,
    y: toSvgY(wall.height, svgY),
  };
}
