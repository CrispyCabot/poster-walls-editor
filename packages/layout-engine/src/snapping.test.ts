import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAP, snapCenter } from './snapping.js';

const wall = { width: 144, height: 96 };
const poster = { width: 20, height: 26 };

/** A 20x26 frame centred at (50, 60): spans x 40..60, y 47..73. */
const neighbour = { rect: { x: 40, y: 47, width: 20, height: 26 } };

describe('snapCenter', () => {
  it('leaves a centre alone when nothing is near', () => {
    const { center, guides } = snapCenter({ x: 100, y: 20 }, poster, [neighbour], wall);
    expect(center).toEqual({ x: 100, y: 20 });
    expect(guides).toEqual([]);
  });

  it('aligns centres when they are close', () => {
    // Moving centre x=50.8 is within threshold of the neighbour's centre 50.
    const { center } = snapCenter({ x: 50.8, y: 20 }, poster, [neighbour], wall);
    expect(center.x).toBe(50);
  });

  it('reports the guide it snapped to, so the canvas can draw it', () => {
    const { guides } = snapCenter({ x: 50.8, y: 20 }, poster, [neighbour], wall);
    expect(guides).toContainEqual({ axis: 'x', at: 50, kind: 'center' });
  });

  it('butts a left edge against a neighbour’s right edge', () => {
    // Neighbour's right edge is x=60. Moving poster's left edge sits at
    // centre-10, so a centre of 70 puts them flush.
    const { center } = snapCenter({ x: 70.9, y: 20 }, poster, [neighbour], wall);
    expect(center.x).toBe(70);
  });

  it('snaps each axis independently', () => {
    // Near the neighbour's centre horizontally AND the wall's mid-height
    // vertically — both should take, from different targets.
    const { center } = snapCenter({ x: 50.7, y: 48.6 }, poster, [neighbour], wall);
    expect(center.x).toBe(50);
    expect(center.y).toBe(48);
  });

  it('snaps to the wall edges', () => {
    // A centre of 10 puts the poster's left edge on the wall's left edge.
    const { center, guides } = snapCenter({ x: 10.6, y: 20 }, poster, [], wall);
    expect(center.x).toBe(10);
    expect(guides).toContainEqual({ axis: 'x', at: 0, kind: 'wall' });
  });

  it('takes the nearest line when several are in range', () => {
    const near = { rect: { x: 40, y: 47, width: 20, height: 26 } };
    const far = { rect: { x: 41.4, y: 47, width: 20, height: 26 } };
    // 50.2 is nearer the first centre (50) than the second (51.4).
    const { center } = snapCenter({ x: 50.2, y: 20 }, poster, [near, far], wall);
    expect(center.x).toBe(50);
  });

  it('ignores lines beyond the threshold', () => {
    const { center } = snapCenter(
      { x: 55, y: 20 },
      poster,
      [neighbour],
      wall,
      { ...DEFAULT_SNAP, threshold: 1 },
    );
    expect(center.x).toBe(55);
  });

  it('honours a wider threshold', () => {
    const { center } = snapCenter(
      { x: 54, y: 20 },
      poster,
      [neighbour],
      wall,
      { ...DEFAULT_SNAP, threshold: 6 },
    );
    expect(center.x).toBe(50);
  });

  it('snaps to a grid when one is set', () => {
    const { center } = snapCenter(
      { x: 31.4, y: 20 },
      poster,
      [],
      wall,
      { threshold: 2, gridIn: 6 },
    );
    expect(center.x).toBe(30);
  });

  it('does not grid-snap when the grid is off', () => {
    // 31.4 keeps every edge clear of the wall lines, so nothing else grabs it.
    const { center } = snapCenter({ x: 31.4, y: 20 }, poster, [], wall, DEFAULT_SNAP);
    expect(center.x).toBe(31.4);
  });
});
