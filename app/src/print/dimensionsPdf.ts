import {
  type LabeledRect,
  type LengthMode,
  computeNeighborDistances,
  formatLength,
  outerSize,
  rectFromCenter,
} from '@pwe/layout-engine';
import type { Obstruction, Placement, Poster, Wall } from '@pwe/shared';
import { type PDFFont, type PDFPage, PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** US Letter, in points. */
const PAGE = { width: 612, height: 792 };
const MARGIN = 40;
const ROW_HEIGHT = 16;
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);
const MID_GRAY = rgb(0.55, 0.55, 0.55);

/** Column widths as fractions of the usable (margin-to-margin) width. */
const COLUMNS = [
  { header: '#', width: 0.05 },
  { header: 'Poster', width: 0.24 },
  { header: 'Size', width: 0.13 },
  { header: 'Left', width: 0.145 },
  { header: 'Right', width: 0.145 },
  { header: 'Top', width: 0.145 },
  { header: 'Bottom', width: 0.145 },
];

function obstructionLabel(o: Obstruction): string {
  return o.label.trim() === '' ? o.kind : o.label;
}

/** Trims text with an ellipsis until it fits maxWidth at the given size. */
function fitText(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && font.widthOfTextAtSize(`${trimmed}…`, size) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

interface Fit {
  scale: number;
  originX: number;
  originY: number;
}

/** Largest scale that centers the wall inside the given box. Wall space and
 * PDF page space both put the origin at the bottom-left with Y increasing
 * upward, so — unlike the on-screen SVG canvas — no Y flip is needed here. */
function fitWallToBox(
  wall: { width: number; height: number },
  box: { x: number; y: number; width: number; height: number },
): Fit {
  const scale = Math.min(box.width / wall.width, box.height / wall.height);
  const drawnWidth = wall.width * scale;
  const drawnHeight = wall.height * scale;
  return {
    scale,
    originX: box.x + (box.width - drawnWidth) / 2,
    originY: box.y + (box.height - drawnHeight) / 2,
  };
}

interface RowContext {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  pageSize: { width: number; height: number };
  font: PDFFont;
  boldFont: PDFFont;
  wallName: string;
}

/** Starts a fresh page when the next row would run past the bottom margin. */
function ensureRoom(ctx: RowContext, drawHeader: (ctx: RowContext) => void): RowContext {
  if (ctx.y - ROW_HEIGHT >= MARGIN) return ctx;
  const page = ctx.doc.addPage([ctx.pageSize.width, ctx.pageSize.height]);
  const next: RowContext = { ...ctx, page, y: ctx.pageSize.height - MARGIN };
  next.page.drawText(`${ctx.wallName} (continued)`, {
    x: MARGIN,
    y: next.y,
    size: 12,
    font: ctx.boldFont,
    color: BLACK,
  });
  next.y -= 24;
  drawHeader(next);
  return next;
}

function columnX(usableWidth: number): number[] {
  const xs: number[] = [];
  let x = MARGIN;
  for (const col of COLUMNS) {
    xs.push(x);
    x += col.width * usableWidth;
  }
  return xs;
}

function drawTableHeader(ctx: RowContext, xs: number[]): void {
  COLUMNS.forEach((col, i) => {
    ctx.page.drawText(col.header, { x: xs[i]!, y: ctx.y, size: 9, font: ctx.boldFont, color: BLACK });
  });
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y - 4 },
    end: { x: ctx.pageSize.width - MARGIN, y: ctx.y - 4 },
    thickness: 0.5,
    color: MID_GRAY,
  });
}

interface PosterRow {
  name: string;
  sizeLabel: string;
  left: string;
  right: string;
  top: string;
  bottom: string;
}

/** Draws one wall's page(s): a to-scale diagram, a poster distance table, and
 * a short obstruction reference list. Returns nothing — mutates the document. */
function drawWallPages(
  doc: PDFDocument,
  font: PDFFont,
  boldFont: PDFFont,
  wall: Wall,
  postersById: Map<string, Poster>,
  placements: Placement[],
  lengthMode: LengthMode,
): void {
  const landscape = wall.widthIn > wall.heightIn;
  const pageSize = landscape ? { width: PAGE.height, height: PAGE.width } : { ...PAGE };
  const usableWidth = pageSize.width - MARGIN * 2;

  const page = doc.addPage([pageSize.width, pageSize.height]);
  let y = pageSize.height - MARGIN;

  page.drawText(wall.name, { x: MARGIN, y, size: 16, font: boldFont, color: BLACK });
  y -= 18;
  page.drawText(
    `${formatLength(wall.widthIn, lengthMode)} wide × ${formatLength(wall.heightIn, lengthMode)} tall`,
    { x: MARGIN, y, size: 10, font, color: GRAY },
  );
  y -= 24;

  const diagramHeight = Math.min(280, pageSize.height * 0.4);
  const diagramBox = { x: MARGIN, y: y - diagramHeight, width: usableWidth, height: diagramHeight };
  const fit = fitWallToBox({ width: wall.widthIn, height: wall.heightIn }, diagramBox);
  const toPage = (x: number, yIn: number) => ({
    x: fit.originX + x * fit.scale,
    y: fit.originY + yIn * fit.scale,
  });

  const wallCorner = toPage(0, 0);
  page.drawRectangle({
    x: wallCorner.x,
    y: wallCorner.y,
    width: wall.widthIn * fit.scale,
    height: wall.heightIn * fit.scale,
    borderColor: BLACK,
    borderWidth: 1,
  });

  const obstructionItems: LabeledRect[] = wall.obstructions.map((o) => ({
    id: `obstruction-${o.id}`,
    label: obstructionLabel(o),
    rect: { x: o.xIn, y: o.yIn, width: o.widthIn, height: o.heightIn },
  }));

  const posterEntries = placements.flatMap((placement) => {
    const poster = postersById.get(placement.posterId);
    if (poster === undefined) return [];
    const outer = outerSize({
      width: poster.widthIn,
      height: poster.heightIn,
      frameWidth: poster.frameWidthIn,
    });
    return [{ poster, placement, rect: rectFromCenter({ x: placement.centerXIn, y: placement.centerYIn }, outer) }];
  });
  const posterItems: LabeledRect[] = posterEntries.map((entry, i) => ({
    id: `poster-${entry.placement.posterId}`,
    label: `#${i + 1} ${entry.poster.name}`,
    rect: entry.rect,
  }));

  const distances = computeNeighborDistances(
    { width: wall.widthIn, height: wall.heightIn },
    [...posterItems, ...obstructionItems],
  );
  const distanceById = new Map(distances.map((d) => [d.id, d]));

  for (const item of obstructionItems) {
    const corner = toPage(item.rect.x, item.rect.y);
    page.drawRectangle({
      x: corner.x,
      y: corner.y,
      width: item.rect.width * fit.scale,
      height: item.rect.height * fit.scale,
      color: LIGHT_GRAY,
      borderColor: MID_GRAY,
      borderWidth: 0.75,
    });
  }

  posterEntries.forEach((entry, i) => {
    const item = posterItems[i]!;
    const corner = toPage(item.rect.x, item.rect.y);
    const w = item.rect.width * fit.scale;
    const h = item.rect.height * fit.scale;
    page.drawRectangle({ x: corner.x, y: corner.y, width: w, height: h, color: rgb(1, 1, 1), borderColor: BLACK, borderWidth: 1 });

    const label = String(i + 1);
    const size = 11;
    const textWidth = boldFont.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: corner.x + w / 2 - textWidth / 2,
      y: corner.y + h / 2 - size / 2.5,
      size,
      font: boldFont,
      color: BLACK,
    });
  });

  y = diagramBox.y - 24;

  const rows: PosterRow[] = posterEntries.map((entry, i) => {
    const d = distanceById.get(posterItems[i]!.id)!;
    const edge = (e: { distanceIn: number; refLabel: string | null }) =>
      `${formatLength(e.distanceIn, lengthMode)} ${e.refLabel === null ? '(wall edge)' : `(${e.refLabel})`}`;
    return {
      name: `#${i + 1} ${entry.poster.name}`,
      sizeLabel: `${formatLength(entry.poster.widthIn, lengthMode)}×${formatLength(entry.poster.heightIn, lengthMode)}`,
      left: edge(d.left),
      right: edge(d.right),
      top: edge(d.top),
      bottom: edge(d.bottom),
    };
  });

  const xs = columnX(usableWidth);
  let ctx: RowContext = { doc, page, y, pageSize, font, boldFont, wallName: wall.name };

  if (rows.length === 0) {
    ctx.page.drawText('No posters hung on this wall.', { x: MARGIN, y: ctx.y, size: 10, font, color: GRAY });
    ctx.y -= ROW_HEIGHT;
  } else {
    drawTableHeader(ctx, xs);
    ctx.y -= ROW_HEIGHT;

    for (const row of rows) {
      ctx = ensureRoom(ctx, (c) => drawTableHeader(c, xs));
      const cells = [null, row.name, row.sizeLabel, row.left, row.right, row.top, row.bottom];
      cells.forEach((text, i) => {
        if (text === null) return;
        const colWidth = COLUMNS[i]!.width * usableWidth - 4;
        ctx.page.drawText(fitText(font, text, 8, colWidth), {
          x: xs[i]!,
          y: ctx.y,
          size: 8,
          font,
          color: BLACK,
        });
      });
      ctx.y -= ROW_HEIGHT;
    }
  }

  if (wall.obstructions.length > 0) {
    ctx.y -= 10;
    if (ctx.y - ROW_HEIGHT < MARGIN) {
      const p = doc.addPage([pageSize.width, pageSize.height]);
      ctx = { ...ctx, page: p, y: pageSize.height - MARGIN };
    }
    ctx.page.drawText('Obstructions', { x: MARGIN, y: ctx.y, size: 11, font: boldFont, color: BLACK });
    ctx.y -= ROW_HEIGHT;
    for (const o of wall.obstructions) {
      ctx = ensureRoom(ctx, () => undefined);
      ctx.page.drawText(
        `${obstructionLabel(o)} — ${formatLength(o.widthIn, lengthMode)}×${formatLength(o.heightIn, lengthMode)}, ${formatLength(o.xIn, lengthMode)} from the left, ${formatLength(o.yIn, lengthMode)} up from the floor`,
        { x: MARGIN, y: ctx.y, size: 9, font, color: GRAY },
      );
      ctx.y -= ROW_HEIGHT;
    }
  }
}

/**
 * Builds a single PDF with one page (or more, if a wall's poster list runs
 * long) per wall: a to-scale diagram plus a table of each poster's distance
 * to the nearest thing on its left, right, top, and bottom.
 */
export async function buildDimensionsPdf(
  walls: Wall[],
  posters: Poster[],
  placementsByWall: Record<string, Placement[]>,
  lengthMode: LengthMode,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const postersById = new Map(posters.map((p) => [p.id, p]));

  for (const wall of walls) {
    drawWallPages(doc, font, boldFont, wall, postersById, placementsByWall[wall.id] ?? [], lengthMode);
  }

  return doc.save();
}

/** Sanitized for use as a filename across OSes. */
export function dimensionsFileName(projectName: string): string {
  const slug = projectName
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${slug === '' ? 'poster-walls' : slug}-dimensions.pdf`;
}

/** Triggers a browser download of the given bytes. Browser-only. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  // pdf-lib's Uint8Array is typed over ArrayBufferLike, which TS's DOM lib
  // does not accept as a BlobPart even though it works fine at runtime.
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
