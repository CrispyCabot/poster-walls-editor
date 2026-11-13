import { fitToViewport, outerSize, wallToScreen } from '@pwe/layout-engine';
import type { Obstruction, Placement, Poster, Wall } from '@pwe/shared';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { Resvg, initWasm as initResvg } from '@resvg/resvg-wasm';
import decodeWebp, { init as initWebp } from '@jsquash/webp/decode.js';

export const SNAPSHOT_LONGEST_SIDE_PX = 1200;
const PADDING_PX = 16;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const KIND_FILL: Record<Obstruction['kind'], string> = {
  door: '#d6d6d6',
  window: '#ededed',
  outlet: '#c4c4c4',
  generic: '#dcdcdc',
};

export type ImageFetcher = (imageKey: string) => Promise<Uint8Array | null>;

export function cloudFrontImageFetcher(baseUrl: string | undefined): ImageFetcher {
  return async (imageKey) => {
    if (baseUrl === undefined || baseUrl === '') return null;
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/i/${encodeURIComponent(imageKey)}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      return bytes.length > MAX_IMAGE_BYTES ? null : bytes;
    } catch {
      return null;
    }
  };
}

const wasmFile = (specifier: string) => readFile(createRequire(import.meta.url).resolve(specifier));

let resvgReady: Promise<void> | undefined;
let webpReady: Promise<void> | undefined;

const ensureResvg = () => (resvgReady ??= wasmFile('@resvg/resvg-wasm/index_bg.wasm').then(initResvg));
const ensureWebp = () =>
  (webpReady ??= wasmFile('@jsquash/webp/codec/dec/webp_dec.wasm').then((bytes) =>
    initWebp({ wasmBinary: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }),
  ));

type ImageFormat = 'png' | 'jpeg' | 'gif' | 'webp';

function sniff(bytes: Uint8Array): ImageFormat | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (ascii(0, 3) === 'GIF') return 'gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

export function downscale(width: number, height: number, rgba: Uint8Array, maxSide: number) {
  const factor = Math.max(1, Math.ceil(Math.max(width, height) / maxSide));
  if (factor === 1) return { width, height, rgba };
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sum = [0, 0, 0, 0];
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * width + x * factor + dx) * 4;
          for (let ch = 0; ch < 4; ch++) sum[ch]! += rgba[i + ch]!;
        }
      }
      for (let ch = 0; ch < 4; ch++) out[(y * w + x) * 4 + ch] = sum[ch]! / (factor * factor);
    }
  }
  return { width: w, height: h, rgba: out };
}

async function asResvgInput(bytes: Uint8Array): Promise<string | null> {
  const format = sniff(bytes);
  if (format === null) return null;
  if (format !== 'webp') return `data:image/${format};base64,${Buffer.from(bytes).toString('base64')}`;
  await ensureWebp();
  const decoded = await decodeWebp(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const small = downscale(decoded.width, decoded.height, new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength), SNAPSHOT_LONGEST_SIDE_PX);
  return `data:image/png;base64,${encodePng(small.width, small.height, small.rgba).toString('base64')}`;
}

async function fitArtwork(bytes: Uint8Array, width: number, height: number): Promise<string | null> {
  const source = await asResvgInput(bytes);
  if (source === null) return null;
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image href="${source}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/></svg>`;
  return `data:image/png;base64,${Buffer.from(await renderPng(svg)).toString('base64')}`;
}

interface Drawn {
  poster: Poster;
  x: number;
  y: number;
  w: number;
  h: number;
  art: { x: number; y: number; w: number; h: number };
}

export interface WallLayout {
  width: number;
  height: number;
  wall: { x: number; y: number; w: number; h: number };
  obstructions: { kind: Obstruction['kind']; x: number; y: number; w: number; h: number }[];
  posters: Drawn[];
}

export function layoutWall(wall: Wall, posters: Poster[], placements: Placement[]): WallLayout {
  const size = { width: wall.widthIn, height: wall.heightIn };
  const scale = (SNAPSHOT_LONGEST_SIDE_PX - PADDING_PX * 2) / Math.max(size.width, size.height);
  const viewport = {
    width: Math.round(size.width * scale + PADDING_PX * 2),
    height: Math.round(size.height * scale + PADDING_PX * 2),
    padding: PADDING_PX,
  };
  const fit = fitToViewport(size, viewport);
  const topLeft = wallToScreen({ x: 0, y: wall.heightIn }, size, fit);
  const byId = new Map(posters.map((p) => [p.id, p]));

  return {
    width: viewport.width,
    height: viewport.height,
    wall: { x: topLeft.x, y: topLeft.y, w: wall.widthIn * fit.scale, h: wall.heightIn * fit.scale },
    obstructions: wall.obstructions.map((o) => {
      const corner = wallToScreen({ x: o.xIn, y: o.yIn + o.heightIn }, size, fit);
      return { kind: o.kind, x: corner.x, y: corner.y, w: o.widthIn * fit.scale, h: o.heightIn * fit.scale };
    }),
    posters: placements.flatMap((placement) => {
      const poster = byId.get(placement.posterId);
      if (poster === undefined) return [];
      const outer = outerSize({ width: poster.widthIn, height: poster.heightIn, frameWidth: poster.frameWidthIn });
      const corner = wallToScreen({ x: placement.centerXIn - outer.width / 2, y: placement.centerYIn + outer.height / 2 }, size, fit);
      const w = outer.width * fit.scale;
      const h = outer.height * fit.scale;
      const inset = poster.frameWidthIn * fit.scale;
      return [{ poster, x: corner.x, y: corner.y, w, h, art: { x: corner.x + inset, y: corner.y + inset, w: Math.max(0, w - inset * 2), h: Math.max(0, h - inset * 2) } }];
    }),
  };
}

export async function loadArtwork(layout: WallLayout, fetchImage: ImageFetcher): Promise<Map<string, string>> {
  const fetched = await Promise.all(
    layout.posters.map(async ({ poster, art }) => ({ poster, art, bytes: poster.imageKey === undefined ? null : await fetchImage(poster.imageKey) })),
  );
  const artwork = new Map<string, string>();
  for (const { poster, art, bytes } of fetched) {
    if (bytes === null || artwork.has(poster.id)) continue;
    const uri = await fitArtwork(bytes, art.w, art.h).catch(() => null);
    if (uri !== null) artwork.set(poster.id, uri);
  }
  return artwork;
}

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => Number(n.toFixed(2));

function shapeOf(shape: Poster['shape'], x: number, y: number, w: number, h: number, attrs: string): string {
  if (shape === 'circle') return `<ellipse cx="${num(x + w / 2)}" cy="${num(y + h / 2)}" rx="${num(w / 2)}" ry="${num(h / 2)}" ${attrs}/>`;
  if (shape === 'diamond') {
    const points = [
      [x + w / 2, y],
      [x + w, y + h / 2],
      [x + w / 2, y + h],
      [x, y + h / 2],
    ];
    return `<polygon points="${points.map((p) => p.map(num).join(',')).join(' ')}" ${attrs}/>`;
  }
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" ${attrs}/>`;
}

export function wallSvg(wall: Wall, layout: WallLayout, artwork: Map<string, string>): string {
  const hung = layout.posters.map(({ poster, x, y, w, h, art }, index) => {
    const href = artwork.get(poster.id);
    const clipId = `clip-${index}`;
    const inner =
      href === undefined
        ? shapeOf(poster.shape, art.x, art.y, art.w, art.h, 'fill="#ffffff"')
        : `<clipPath id="${clipId}">${shapeOf(poster.shape, art.x, art.y, art.w, art.h, '')}</clipPath>` +
          `<image href="${href}" x="${num(art.x)}" y="${num(art.y)}" width="${num(art.w)}" height="${num(art.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>`;
    return (
      shapeOf(poster.shape, x, y, w, h, `fill="${esc(poster.frameColor)}"`) +
      inner +
      shapeOf(poster.shape, x, y, w, h, 'fill="none" stroke="#000000" stroke-opacity="0.3"')
    );
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    shapeOf('rect', layout.wall.x, layout.wall.y, layout.wall.w, layout.wall.h, `fill="${esc(wall.backgroundColor)}" stroke="#000000"`) +
    layout.obstructions.map((o) => shapeOf('rect', o.x, o.y, o.w, o.h, `fill="${KIND_FILL[o.kind]}" stroke="#000000"`)).join('') +
    hung.join('') +
    '</svg>'
  );
}

export async function renderPng(svg: string): Promise<Uint8Array> {
  await ensureResvg();
  const resvg = new Resvg(svg);
  try {
    const image = resvg.render();
    try {
      return image.asPng();
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
}
