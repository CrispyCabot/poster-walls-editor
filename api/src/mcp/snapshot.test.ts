import { Resvg } from '@resvg/resvg-wasm';
import type { Poster, Wall } from '@pwe/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { downscale, encodePng, layoutWall, loadArtwork, renderPng, wallSvg } from './snapshot.js';

const BLUE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4/ooor/qoP+a8/9k=',
  'base64',
);

const wall: Wall = {
  id: 'w',
  name: 'Hall',
  widthIn: 100,
  heightIn: 50,
  backgroundColor: '#00FF00',
  obstructions: [{ id: 'd', kind: 'door', label: 'Door', xIn: 0, yIn: 0, widthIn: 20, heightIn: 40 }],
};
const poster: Poster = { id: 'p', name: 'Sea', widthIn: 20, heightIn: 20, frameWidthIn: 2, frameColor: '#FF0000', shape: 'rect', imageKey: 'sea.jpg' };

function pixel(svg: string, x: number, y: number): number[] {
  const image = new Resvg(svg).render();
  const i = (Math.round(y) * image.width + Math.round(x)) * 4;
  return [...image.pixels.subarray(i, i + 3)];
}

beforeAll(() => renderPng('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'));

describe('wall snapshots', () => {
  it('places posters to scale with the floor at the bottom', () => {
    const layout = layoutWall(wall, [poster], [{ posterId: 'p', centerXIn: 50, centerYIn: 12 }]);
    const scale = (1200 - 32) / 100;
    expect(layout).toMatchObject({ width: 1200, height: Math.round(50 * scale + 32) });
    const drawn = layout.posters[0]!;
    expect(drawn.w).toBeCloseTo(24 * scale);
    expect(drawn.y + drawn.h).toBeCloseTo(16 + 50 * scale);
    expect(drawn.art.w).toBeCloseTo(20 * scale);
  });

  it('draws the wall, its obstructions, the frame and the artwork', async () => {
    const layout = layoutWall(wall, [poster], [{ posterId: 'p', centerXIn: 50, centerYIn: 25 }]);
    const artwork = await loadArtwork(layout, async () => BLUE_JPEG);
    const svg = wallSvg(wall, layout, artwork);
    const p = layout.posters[0]!;
    expect(pixel(svg, p.x + p.w / 2, p.y + p.h / 2)).toEqual([0, 128, 255]);
    expect(pixel(svg, p.x + 3, p.y + p.h / 2)).toEqual([255, 0, 0]);
    expect(pixel(svg, layout.wall.x + layout.wall.w - 5, layout.wall.y + 5)).toEqual([0, 255, 0]);
    const door = layout.obstructions[0]!;
    expect(pixel(svg, door.x + door.w / 2, door.y + door.h / 2)).toEqual([214, 214, 214]);
  });

  it('leaves a poster blank when its image cannot be read', async () => {
    const layout = layoutWall(wall, [poster], [{ posterId: 'p', centerXIn: 50, centerYIn: 25 }]);
    const artwork = await loadArtwork(layout, async () => new Uint8Array([1, 2, 3]));
    expect(artwork.size).toBe(0);
    const p = layout.posters[0]!;
    expect(pixel(wallSvg(wall, layout, artwork), p.x + p.w / 2, p.y + p.h / 2)).toEqual([255, 255, 255]);
  });

  it('encodes and shrinks raw pixels', async () => {
    const rgba = new Uint8Array(4 * 4 * 4).map((_, i) => (i % 4 === 3 ? 255 : 200));
    const small = downscale(4, 4, rgba, 2);
    expect(small).toMatchObject({ width: 2, height: 2 });
    const uri = `data:image/png;base64,${encodePng(small.width, small.height, small.rgba).toString('base64')}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><image href="${uri}" width="2" height="2"/></svg>`;
    expect(pixel(svg, 1, 1)).toEqual([200, 200, 200]);
  });
});
