import type { Point, Rect, Size } from './geometry.js';

/**
 * A line the dragged poster has aligned to, for drawing feedback.
 *
 * `axis` is the axis the line runs along in wall space: a 'y' guide is a
 * horizontal line at a fixed height, an 'x' guide is a vertical one.
 */
export interface Guide {
  axis: 'x' | 'y';
  /** Position in inches along the perpendicular axis. */
  at: number;
  kind: 'edge' | 'center' | 'wall';
}

export interface SnapTarget {
  /** The rectangle to align against, in wall space. */
  rect: Rect;
}

export interface SnapOptions {
  /** How close, in inches, before an edge grabs. */
  threshold: number;
  /** Snap to a grid of this many inches. 0 disables it. */
  gridIn: number;
}

export const DEFAULT_SNAP: SnapOptions = { threshold: 1.5, gridIn: 0 };

interface Candidate {
  value: number;
  distance: number;
  guideAt: number;
  kind: Guide['kind'];
}

/**
 * Keeps whichever candidate is closest, so the nearest line wins.
 *
 * Ties break toward a centre alignment. Two posters of equal width sitting
 * side by side align on their left edges and on their centres at exactly the
 * same distance, and "these are centred on each other" is the more useful
 * thing to show someone than "these left edges touch".
 */
function best(a: Candidate | null, b: Candidate): Candidate {
  if (a === null) return b;
  if (b.distance < a.distance) return b;
  if (b.distance > a.distance) return a;
  return b.kind === 'center' && a.kind !== 'center' ? b : a;
}

/**
 * Snaps a dragged poster's centre to nearby edges, centres, and the wall.
 *
 * Works on one axis at a time, so a poster can snap horizontally to one
 * neighbour while snapping vertically to a different one — which is what makes
 * a grid of frames line up without fighting the pointer.
 *
 * Returns the adjusted centre plus the guides that were hit, so the canvas can
 * draw exactly the alignments the user is getting rather than guessing.
 */
export function snapCenter(
  center: Point,
  moving: Size,
  targets: SnapTarget[],
  wall: Size,
  options: SnapOptions = DEFAULT_SNAP,
): { center: Point; guides: Guide[] } {
  const halfW = moving.width / 2;
  const halfH = moving.height / 2;

  // Every x the moving poster could align on: its own left, centre, right.
  const movingX = [
    { offset: -halfW, kind: 'edge' as const },
    { offset: 0, kind: 'center' as const },
    { offset: halfW, kind: 'edge' as const },
  ];
  const movingY = [
    { offset: -halfH, kind: 'edge' as const },
    { offset: 0, kind: 'center' as const },
    { offset: halfH, kind: 'edge' as const },
  ];

  // Lines worth snapping to on each axis.
  const linesX: { at: number; kind: Guide['kind'] }[] = [
    { at: 0, kind: 'wall' },
    { at: wall.width / 2, kind: 'wall' },
    { at: wall.width, kind: 'wall' },
  ];
  const linesY: { at: number; kind: Guide['kind'] }[] = [
    { at: 0, kind: 'wall' },
    { at: wall.height / 2, kind: 'wall' },
    { at: wall.height, kind: 'wall' },
  ];

  for (const { rect } of targets) {
    linesX.push(
      { at: rect.x, kind: 'edge' },
      { at: rect.x + rect.width / 2, kind: 'center' },
      { at: rect.x + rect.width, kind: 'edge' },
    );
    linesY.push(
      { at: rect.y, kind: 'edge' },
      { at: rect.y + rect.height / 2, kind: 'center' },
      { at: rect.y + rect.height, kind: 'edge' },
    );
  }

  if (options.gridIn > 0) {
    const g = options.gridIn;
    linesX.push({ at: Math.round(center.x / g) * g, kind: 'wall' });
    linesY.push({ at: Math.round(center.y / g) * g, kind: 'wall' });
  }

  let pickX: Candidate | null = null;
  for (const line of linesX) {
    for (const m of movingX) {
      const distance = Math.abs(center.x + m.offset - line.at);
      if (distance <= options.threshold) {
        pickX = best(pickX, {
          value: line.at - m.offset,
          distance,
          guideAt: line.at,
          // A centre-to-centre alignment is the more meaningful one to show.
          kind: m.kind === 'center' ? 'center' : line.kind,
        });
      }
    }
  }

  let pickY: Candidate | null = null;
  for (const line of linesY) {
    for (const m of movingY) {
      const distance = Math.abs(center.y + m.offset - line.at);
      if (distance <= options.threshold) {
        pickY = best(pickY, {
          value: line.at - m.offset,
          distance,
          guideAt: line.at,
          kind: m.kind === 'center' ? 'center' : line.kind,
        });
      }
    }
  }

  const guides: Guide[] = [];
  if (pickX !== null) guides.push({ axis: 'x', at: pickX.guideAt, kind: pickX.kind });
  if (pickY !== null) guides.push({ axis: 'y', at: pickY.guideAt, kind: pickY.kind });

  return {
    center: {
      x: pickX?.value ?? center.x,
      y: pickY?.value ?? center.y,
    },
    guides,
  };
}
