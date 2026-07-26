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
