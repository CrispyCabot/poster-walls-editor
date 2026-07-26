import { describe, expect, it } from 'vitest';
import {
  CreateProjectSchema,
  ObstructionSchema,
  PlacementSchema,
  PosterSchema,
  WallSchema,
} from './schemas.js';

describe('PosterSchema', () => {
  const valid = {
    id: 'p1',
    name: 'Blade Runner',
    widthIn: 24,
    heightIn: 36,
    frameWidthIn: 1,
    frameColor: '#000000',
  };

  it('accepts a valid poster', () => {
    expect(PosterSchema.parse(valid)).toMatchObject({ name: 'Blade Runner' });
  });

  it('applies the spec defaults for frame width and color', () => {
    const parsed = PosterSchema.parse({
      id: 'p1', name: 'Akira', widthIn: 24, heightIn: 36,
    });
    expect(parsed.frameWidthIn).toBe(1);
    expect(parsed.frameColor).toBe('#000000');
  });

  it('requires a non-empty name', () => {
    expect(() => PosterSchema.parse({ ...valid, name: '' })).toThrow();
  });

  it('rejects non-positive dimensions', () => {
    expect(() => PosterSchema.parse({ ...valid, widthIn: 0 })).toThrow();
    expect(() => PosterSchema.parse({ ...valid, heightIn: -5 })).toThrow();
  });

  it('rejects a malformed frame color', () => {
    expect(() => PosterSchema.parse({ ...valid, frameColor: 'black' })).toThrow();
  });

  it('allows a zero-width frame', () => {
    expect(PosterSchema.parse({ ...valid, frameWidthIn: 0 }).frameWidthIn).toBe(0);
  });
});

describe('ObstructionSchema', () => {
  it('accepts every documented kind', () => {
    for (const kind of ['door', 'window', 'outlet', 'generic'] as const) {
      const parsed = ObstructionSchema.parse({
        id: 'o1', kind, label: 'x', x: 0, y: 0, width: 30, height: 80,
      });
      expect(parsed.kind).toBe(kind);
    }
  });

  it('rejects an unknown kind', () => {
    expect(() => ObstructionSchema.parse({
      id: 'o1', kind: 'skylight', label: 'x', x: 0, y: 0, width: 1, height: 1,
    })).toThrow();
  });

  it('permits an obstruction at the wall origin', () => {
    expect(ObstructionSchema.parse({
      id: 'o1', kind: 'door', label: 'Front', x: 0, y: 0, width: 32, height: 80,
    }).x).toBe(0);
  });
});

describe('WallSchema', () => {
  it('defaults obstructions to an empty array', () => {
    const wall = WallSchema.parse({
      id: 'w1', name: 'North', widthIn: 144, heightIn: 96,
    });
    expect(wall.obstructions).toEqual([]);
  });

  it('rejects a wall with no size', () => {
    expect(() => WallSchema.parse({
      id: 'w1', name: 'North', widthIn: 0, heightIn: 96,
    })).toThrow();
  });
});

describe('PlacementSchema', () => {
  it('accepts a negative center, since a poster may overhang while dragging', () => {
    expect(PlacementSchema.parse({ posterId: 'p1', centerX: -2, centerY: 10 }))
      .toMatchObject({ centerX: -2 });
  });
});

describe('CreateProjectSchema', () => {
  it('defaults visibility to private', () => {
    expect(CreateProjectSchema.parse({ name: 'Living Room' }).visibility)
      .toBe('private');
  });

  it('rejects an empty name', () => {
    expect(() => CreateProjectSchema.parse({ name: '' })).toThrow();
  });
});
