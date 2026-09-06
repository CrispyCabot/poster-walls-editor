import { describe, expect, it } from 'vitest';
import { computeNeighborDistances, type LabeledRect } from './dimensions.js';

const wall = { width: 100, height: 100 };

function byId(results: ReturnType<typeof computeNeighborDistances>, id: string) {
  const found = results.find((r) => r.id === id);
  if (found === undefined) throw new Error(`missing ${id}`);
  return found;
}

describe('computeNeighborDistances', () => {
  it('measures to the wall edges when there is nothing else on the wall', () => {
    const items: LabeledRect[] = [
      { id: 'a', label: 'A', rect: { x: 20, y: 30, width: 10, height: 10 } },
    ];
    const [a] = computeNeighborDistances(wall, items);
    expect(a).toEqual({
      id: 'a',
      left: { distanceIn: 20, refLabel: null },
      right: { distanceIn: 70, refLabel: null },
      bottom: { distanceIn: 30, refLabel: null },
      top: { distanceIn: 60, refLabel: null },
    });
  });

  it('measures to a neighbour sharing the same vertical span, left to right', () => {
    const items: LabeledRect[] = [
      { id: 'a', label: 'A', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'b', label: 'B', rect: { x: 20, y: 0, width: 10, height: 10 } },
    ];
    const results = computeNeighborDistances(wall, items);
    expect(byId(results, 'a').right).toEqual({ distanceIn: 10, refLabel: 'B' });
    expect(byId(results, 'b').left).toEqual({ distanceIn: 10, refLabel: 'A' });
  });

  it('measures to a neighbour sharing the same horizontal span, above and below', () => {
    const items: LabeledRect[] = [
      { id: 'a', label: 'A', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'b', label: 'B', rect: { x: 0, y: 25, width: 10, height: 10 } },
    ];
    const results = computeNeighborDistances(wall, items);
    expect(byId(results, 'a').top).toEqual({ distanceIn: 15, refLabel: 'B' });
    expect(byId(results, 'b').bottom).toEqual({ distanceIn: 15, refLabel: 'A' });
  });

  it('ignores a neighbour that does not share any span on the other axis', () => {
    // b sits above-and-to-the-right of a with no shared x or y range, so it
    // is not "directly" above, below, left, or right of a.
    const items: LabeledRect[] = [
      { id: 'a', label: 'A', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'b', label: 'B', rect: { x: 50, y: 50, width: 10, height: 10 } },
    ];
    const results = computeNeighborDistances(wall, items);
    const a = byId(results, 'a');
    expect(a.right.refLabel).toBeNull();
    expect(a.top.refLabel).toBeNull();
  });

  it('picks the nearest of several candidates on the same side', () => {
    const items: LabeledRect[] = [
      { id: 'a', label: 'A', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'near', label: 'Near', rect: { x: 20, y: 0, width: 5, height: 10 } },
      { id: 'far', label: 'Far', rect: { x: 40, y: 0, width: 5, height: 10 } },
    ];
    const results = computeNeighborDistances(wall, items);
    expect(byId(results, 'a').right).toEqual({ distanceIn: 10, refLabel: 'Near' });
  });

  it('treats edge-flush neighbours as touching, with zero distance', () => {
    const items: LabeledRect[] = [
      { id: 'a', label: 'A', rect: { x: 0, y: 0, width: 10, height: 10 } },
      { id: 'b', label: 'B', rect: { x: 10, y: 0, width: 10, height: 10 } },
    ];
    const results = computeNeighborDistances(wall, items);
    expect(byId(results, 'a').right).toEqual({ distanceIn: 0, refLabel: 'B' });
  });
});
