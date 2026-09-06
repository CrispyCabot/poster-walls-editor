import type { Rect, Size } from './geometry.js';

/** A poster's outer frame, or an obstruction, ready to be measured against. */
export interface LabeledRect {
  id: string;
  label: string;
  rect: Rect;
}

export interface EdgeDistance {
  distanceIn: number;
  /** The neighbour's label, or null when the nearest thing is the wall edge. */
  refLabel: string | null;
}

export interface ItemDistances {
  id: string;
  left: EdgeDistance;
  right: EdgeDistance;
  top: EdgeDistance;
  bottom: EdgeDistance;
}

/** True when the two spans share any of their length, edges excluded. */
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * For one item, finds the closest neighbour directly to its left/right/top/
 * bottom — "directly" meaning it shares part of the item's span on the other
 * axis, the way a tape measure run straight out from an edge would hit it.
 * Falls back to the wall boundary when nothing is in the way.
 */
function distancesFor(item: Rect, others: LabeledRect[], wall: Size): Omit<ItemDistances, 'id'> {
  const itemRight = item.x + item.width;
  const itemTop = item.y + item.height;

  let left: EdgeDistance = { distanceIn: item.x, refLabel: null };
  let right: EdgeDistance = { distanceIn: wall.width - itemRight, refLabel: null };
  let bottom: EdgeDistance = { distanceIn: item.y, refLabel: null };
  let top: EdgeDistance = { distanceIn: wall.height - itemTop, refLabel: null };

  for (const other of others) {
    const o = other.rect;
    const oRight = o.x + o.width;
    const oTop = o.y + o.height;

    if (rangesOverlap(item.y, itemTop, o.y, oTop)) {
      if (oRight <= item.x) {
        const distance = item.x - oRight;
        if (distance < left.distanceIn) left = { distanceIn: distance, refLabel: other.label };
      }
      if (o.x >= itemRight) {
        const distance = o.x - itemRight;
        if (distance < right.distanceIn) right = { distanceIn: distance, refLabel: other.label };
      }
    }

    if (rangesOverlap(item.x, itemRight, o.x, oRight)) {
      if (oTop <= item.y) {
        const distance = item.y - oTop;
        if (distance < bottom.distanceIn) bottom = { distanceIn: distance, refLabel: other.label };
      }
      if (o.y >= itemTop) {
        const distance = o.y - itemTop;
        if (distance < top.distanceIn) top = { distanceIn: distance, refLabel: other.label };
      }
    }
  }

  return { left, right, top, bottom };
}

/**
 * Computes, for every item, the gap to the nearest other item (or the wall
 * edge) on each of its four sides — what someone hanging these by hand would
 * measure with a tape.
 */
export function computeNeighborDistances(wall: Size, items: LabeledRect[]): ItemDistances[] {
  return items.map((item) => {
    const others = items.filter((i) => i.id !== item.id);
    const { left, right, top, bottom } = distancesFor(item.rect, others, wall);
    return { id: item.id, left, right, top, bottom };
  });
}
