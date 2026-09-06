import { describe, expect, it } from 'vitest';
import { findDuplicatePlacements } from './duplicates.js';

describe('findDuplicatePlacements', () => {
  const walls = [
    { id: 'w1', name: 'North wall' },
    { id: 'w2', name: 'South wall' },
    { id: 'w3', name: 'Garage wall' },
  ];

  it('omits posters placed on only one wall', () => {
    const result = findDuplicatePlacements(walls, {
      w1: [{ posterId: 'p1' }],
      w2: [],
      w3: [],
    });
    expect(result.size).toBe(0);
  });

  it('flags a poster placed on two walls, listing both by name', () => {
    const result = findDuplicatePlacements(walls, {
      w1: [{ posterId: 'p1' }],
      w2: [{ posterId: 'p1' }],
      w3: [],
    });
    expect(result.get('p1')).toEqual(['North wall', 'South wall']);
  });

  it('flags a poster placed on all three walls', () => {
    const result = findDuplicatePlacements(walls, {
      w1: [{ posterId: 'p1' }],
      w2: [{ posterId: 'p1' }],
      w3: [{ posterId: 'p1' }],
    });
    expect(result.get('p1')).toEqual(['North wall', 'South wall', 'Garage wall']);
  });

  it('does not confuse two different posters each placed once', () => {
    const result = findDuplicatePlacements(walls, {
      w1: [{ posterId: 'p1' }],
      w2: [{ posterId: 'p2' }],
      w3: [],
    });
    expect(result.size).toBe(0);
  });

  it('handles walls missing from placementsByWall', () => {
    const result = findDuplicatePlacements(walls, {});
    expect(result.size).toBe(0);
  });

  it('ignores repeated posterIds within the same wall (not a cross-wall duplicate)', () => {
    const result = findDuplicatePlacements(walls, {
      w1: [{ posterId: 'p1' }, { posterId: 'p1' }],
      w2: [],
      w3: [],
    });
    expect(result.size).toBe(0);
  });
});
