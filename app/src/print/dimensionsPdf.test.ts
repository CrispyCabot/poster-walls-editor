import type { Obstruction, Placement, Poster, Wall } from '@pwe/shared';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildDimensionsPdf, dimensionsFileName } from './dimensionsPdf.js';

function makeWall(overrides: Partial<Wall> & Pick<Wall, 'id' | 'name'>): Wall {
  return {
    widthIn: 96,
    heightIn: 96,
    obstructions: [],
    backgroundColor: '#FFFFFF',
    ...overrides,
  };
}

function makePoster(overrides: Partial<Poster> & Pick<Poster, 'id' | 'name'>): Poster {
  return {
    widthIn: 24,
    heightIn: 36,
    frameWidthIn: 1,
    frameColor: '#000000',
    shape: 'rect',
    ...overrides,
  };
}

describe('buildDimensionsPdf', () => {
  it('produces one page per wall when nothing overflows', async () => {
    const walls = [
      makeWall({ id: 'w1', name: 'North wall' }),
      makeWall({ id: 'w2', name: 'South wall', widthIn: 144, heightIn: 48 }),
    ];
    const posters: Poster[] = [makePoster({ id: 'p1', name: 'Blade Runner' })];
    const placementsByWall: Record<string, Placement[]> = {
      w1: [{ posterId: 'p1', centerXIn: 48, centerYIn: 57 }],
      w2: [],
    };

    const bytes = await buildDimensionsPdf(walls, posters, placementsByWall, 'inches');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it('gives a wider-than-tall wall a landscape page', async () => {
    const walls = [makeWall({ id: 'w1', name: 'Long wall', widthIn: 240, heightIn: 96 })];
    const bytes = await buildDimensionsPdf(walls, [], { w1: [] }, 'inches');
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPage(0);
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());
  });

  it('gives a taller-than-wide wall a portrait page', async () => {
    const walls = [makeWall({ id: 'w1', name: 'Narrow wall', widthIn: 48, heightIn: 96 })];
    const bytes = await buildDimensionsPdf(walls, [], { w1: [] }, 'inches');
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPage(0);
    expect(page.getHeight()).toBeGreaterThan(page.getWidth());
  });

  it('spills a long poster table onto a continuation page', async () => {
    const wall = makeWall({ id: 'w1', name: 'Gallery wall', widthIn: 400, heightIn: 96 });
    const posters: Poster[] = Array.from({ length: 60 }, (_, i) =>
      makePoster({ id: `p${i}`, name: `Poster ${i}` }),
    );
    const placements: Placement[] = posters.map((p, i) => ({
      posterId: p.id,
      centerXIn: 5 + i * 6,
      centerYIn: 30,
    }));

    const bytes = await buildDimensionsPdf([wall], posters, { w1: placements }, 'inches');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('handles a wall with no posters without throwing', async () => {
    const wall = makeWall({ id: 'w1', name: 'Empty wall' });
    const bytes = await buildDimensionsPdf([wall], [], { w1: [] }, 'inches');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it('includes obstructions on the page without erroring', async () => {
    const obstruction: Obstruction = {
      id: 'o1',
      kind: 'door',
      label: 'Front door',
      xIn: 10,
      yIn: 0,
      widthIn: 30,
      heightIn: 80,
    };
    const wall = makeWall({ id: 'w1', name: 'Entry wall', obstructions: [obstruction] });
    const poster = makePoster({ id: 'p1', name: 'Map' });
    const placements: Placement[] = [{ posterId: 'p1', centerXIn: 70, centerYIn: 57 }];

    const bytes = await buildDimensionsPdf([wall], [poster], { w1: placements }, 'inches');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

describe('dimensionsFileName', () => {
  it('slugifies the project name', () => {
    expect(dimensionsFileName('My Living Room!')).toBe('my-living-room-dimensions.pdf');
  });

  it('falls back to a default name when nothing alphanumeric remains', () => {
    expect(dimensionsFileName('***')).toBe('poster-walls-dimensions.pdf');
  });
});
