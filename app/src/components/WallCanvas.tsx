import {
  type Guide,
  type LengthMode,
  type SnapOptions,
  type SnapTarget,
  DEFAULT_SNAP,
  type Viewport,
  fitToViewport,
  formatLength,
  outerSize,
  rectFromCenter,
  screenToWall,
  snapCenter,
  wallToScreen,
} from '@pwe/layout-engine';
import type { Obstruction, Placement, Poster, Wall } from '@pwe/shared';
import { useRef, useState } from 'react';
import { getConfig } from '../config.js';
import { PosterShape } from './PosterShape.js';

const KIND_FILL: Record<Obstruction['kind'], string> = {
  door: 'var(--obstruction-door)',
  window: 'var(--obstruction-window)',
  outlet: 'var(--obstruction-outlet)',
  generic: 'var(--obstruction-generic)',
};

export interface WallCanvasProps {
  wall: Wall;
  posters: Poster[];
  placements: Placement[];
  viewport: Viewport;
  lengthMode: LengthMode;
  /** Called when a drag ends, with the poster's new centre in inches. */
  onMove: (posterId: string, centerXIn: number, centerYIn: number) => void;
  /** Snap behaviour. Pass threshold 0 to turn snapping off. */
  snapOptions?: SnapOptions;
}

export function WallCanvas({
  wall,
  posters,
  placements,
  viewport,
  lengthMode,
  onMove,
  snapOptions = DEFAULT_SNAP,
}: WallCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Live position while dragging, so the poster follows the pointer without a
  // round trip to the server on every frame.
  const [preview, setPreview] = useState<Placement | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);

  const size = { width: wall.widthIn, height: wall.heightIn };
  const fit = fitToViewport(size, viewport);
  const topLeft = wallToScreen({ x: 0, y: wall.heightIn }, size, fit);
  const drawnWidth = wall.widthIn * fit.scale;
  const drawnHeight = wall.heightIn * fit.scale;

  const byId = new Map(posters.map((p) => [p.id, p]));

  /**
   * Pointer position in wall inches.
   *
   * Uses the SVG's own screen matrix rather than measuring the bounding box.
   * The element is sized by CSS while the drawing is sized by the viewBox, so
   * `preserveAspectRatio` letterboxes whenever those two ratios differ — which
   * they do on almost every mobile viewport. A linear rect-based mapping would
   * silently drift by the size of the letterbox; the matrix accounts for it.
   */
  function pointerToWall(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (svg === null || ctm === null || ctm === undefined) return { x: 0, y: 0 };
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return screenToWall({ x: point.x, y: point.y }, size, fit);
  }

  function clamp(placement: Placement, poster: Poster): Placement {
    const outer = outerSize({
      width: poster.widthIn,
      height: poster.heightIn,
      frameWidth: poster.frameWidthIn,
    });
    const halfW = outer.width / 2;
    const halfH = outer.height / 2;
    return {
      posterId: placement.posterId,
      centerXIn: Math.min(Math.max(placement.centerXIn, halfW), wall.widthIn - halfW),
      centerYIn: Math.min(Math.max(placement.centerYIn, halfH), wall.heightIn - halfH),
    };
  }

  const shown = placements.map((p) =>
    preview !== null && preview.posterId === p.posterId ? preview : p,
  );

  return (
    <svg
      ref={svgRef}
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      role="img"
      aria-label={`${wall.name}, ${formatLength(wall.widthIn, lengthMode)} wide by ${formatLength(wall.heightIn, lengthMode)} tall`}
      style={{ touchAction: 'none' }}
      onPointerMove={(e) => {
        if (dragging === null) return;
        const poster = byId.get(dragging);
        if (poster === undefined) return;

        const at = pointerToWall(e);
        const moving = outerSize({
          width: poster.widthIn,
          height: poster.heightIn,
          frameWidth: poster.frameWidthIn,
        });

        // Snap against every other placed poster plus the obstructions, so a
        // frame lines up with a window as readily as with another frame.
        const targets: SnapTarget[] = [
          ...placements
            .filter((p) => p.posterId !== dragging)
            .flatMap((p) => {
              const other = byId.get(p.posterId);
              if (other === undefined) return [];
              const outer = outerSize({
                width: other.widthIn,
                height: other.heightIn,
                frameWidth: other.frameWidthIn,
              });
              return [{ rect: rectFromCenter({ x: p.centerXIn, y: p.centerYIn }, outer) }];
            }),
          ...wall.obstructions.map((o) => ({
            rect: { x: o.xIn, y: o.yIn, width: o.widthIn, height: o.heightIn },
          })),
        ];

        const snapped = snapCenter(at, moving, targets, size, snapOptions);
        setGuides(snapped.guides);
        setPreview(
          clamp(
            {
              posterId: dragging,
              centerXIn: snapped.center.x,
              centerYIn: snapped.center.y,
            },
            poster,
          ),
        );
      }}
      onPointerUp={() => {
        if (dragging !== null && preview !== null) {
          onMove(preview.posterId, preview.centerXIn, preview.centerYIn);
        }
        setDragging(null);
        setPreview(null);
        setGuides([]);
      }}
      onPointerLeave={() => {
        setDragging(null);
        setPreview(null);
        setGuides([]);
      }}
    >
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={drawnWidth}
        height={drawnHeight}
        fill={wall.backgroundColor}
        stroke="var(--canvas-edge)"
        strokeWidth={1}
      />

      {wall.obstructions.map((o) => {
        // Stored y is the BOTTOM edge in wall space, so the screen position
        // comes from the top edge.
        const corner = wallToScreen({ x: o.xIn, y: o.yIn + o.heightIn }, size, fit);
        return (
          <rect
            key={o.id}
            data-testid={`obstruction-${o.id}`}
            aria-label={`${o.kind}: ${o.label}`}
            x={corner.x}
            y={corner.y}
            width={o.widthIn * fit.scale}
            height={o.heightIn * fit.scale}
            fill={KIND_FILL[o.kind]}
            stroke="var(--obstruction-edge)"
            strokeWidth={1}
          />
        );
      })}

      {/* Alignment guides, drawn under the posters so they never obscure the
          thing being positioned. */}
      {guides.map((g) => {
        const at = wallToScreen(
          g.axis === 'x' ? { x: g.at, y: 0 } : { x: 0, y: g.at },
          size,
          fit,
        );
        return g.axis === 'x' ? (
          <line
            key={`gx-${g.at}`}
            x1={at.x}
            y1={topLeft.y}
            x2={at.x}
            y2={topLeft.y + drawnHeight}
            stroke="var(--canvas-selected)"
            strokeWidth={1}
            strokeDasharray={g.kind === 'center' ? undefined : '5 4'}
          />
        ) : (
          <line
            key={`gy-${g.at}`}
            x1={topLeft.x}
            y1={at.y}
            x2={topLeft.x + drawnWidth}
            y2={at.y}
            stroke="var(--canvas-selected)"
            strokeWidth={1}
            strokeDasharray={g.kind === 'center' ? undefined : '5 4'}
          />
        );
      })}

      {shown.map((placement) => {
        const poster = byId.get(placement.posterId);
        if (poster === undefined) return null;

        const outer = outerSize({
          width: poster.widthIn,
          height: poster.heightIn,
          frameWidth: poster.frameWidthIn,
        });
        const corner = wallToScreen(
          {
            x: placement.centerXIn - outer.width / 2,
            y: placement.centerYIn + outer.height / 2,
          },
          size,
          fit,
        );

        const frameW = outer.width * fit.scale;
        const frameH = outer.height * fit.scale;
        const inset = poster.frameWidthIn * fit.scale;
        const artW = poster.widthIn * fit.scale;
        const artH = poster.heightIn * fit.scale;
        const href =
          poster.imageKey === undefined
            ? undefined
            : `${getConfig().imageBaseUrl}/i/${poster.imageKey}`;

        return (
          <g
            key={placement.posterId}
            data-testid={`poster-${placement.posterId}`}
            style={{ cursor: dragging === placement.posterId ? 'grabbing' : 'grab' }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(placement.posterId);
              setPreview(placement);
            }}
          >
            <PosterShape
              poster={poster}
              x={corner.x}
              y={corner.y}
              width={frameW}
              height={frameH}
              inset={inset}
              href={href}
              clipId={`clip-${placement.posterId}`}
              outlineColor={
                dragging === placement.posterId
                  ? 'var(--canvas-selected)'
                  : 'var(--poster-outline)'
              }
              outlineWidth={dragging === placement.posterId ? 2 : 1}
            />
          </g>
        );
      })}
    </svg>
  );
}
