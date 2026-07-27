import {
  type LengthMode,
  type Viewport,
  fitToViewport,
  formatLength,
  outerSize,
  screenToWall,
  wallToScreen,
} from '@pwe/layout-engine';
import type { Obstruction, Placement, Poster, Wall } from '@pwe/shared';
import { useRef, useState } from 'react';
import { getConfig } from '../config.js';

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
}

export function WallCanvas({
  wall,
  posters,
  placements,
  viewport,
  lengthMode,
  onMove,
}: WallCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // Live position while dragging, so the poster follows the pointer without a
  // round trip to the server on every frame.
  const [preview, setPreview] = useState<Placement | null>(null);

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
        setPreview(
          clamp({ posterId: dragging, centerXIn: at.x, centerYIn: at.y }, poster),
        );
      }}
      onPointerUp={() => {
        if (dragging !== null && preview !== null) {
          onMove(preview.posterId, preview.centerXIn, preview.centerYIn);
        }
        setDragging(null);
        setPreview(null);
      }}
      onPointerLeave={() => {
        setDragging(null);
        setPreview(null);
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
            {poster.shape === 'circle' ? (
              <>
                <ellipse
                  cx={corner.x + frameW / 2}
                  cy={corner.y + frameH / 2}
                  rx={frameW / 2}
                  ry={frameH / 2}
                  fill={poster.frameColor}
                />
                <clipPath id={`clip-${placement.posterId}`}>
                  <ellipse
                    cx={corner.x + frameW / 2}
                    cy={corner.y + frameH / 2}
                    rx={artW / 2}
                    ry={artH / 2}
                  />
                </clipPath>
                {href === undefined ? (
                  <>
                    <ellipse
                      cx={corner.x + frameW / 2}
                      cy={corner.y + frameH / 2}
                      rx={artW / 2}
                      ry={artH / 2}
                      fill="var(--poster-blank)"
                    />
                    <text
                      x={corner.x + frameW / 2}
                      y={corner.y + frameH / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.max(8, Math.min(14, artW / 9))}
                      fill="var(--poster-blank-ink)"
                    >
                      {poster.name}
                    </text>
                  </>
                ) : (
                  <image
                    href={href}
                    x={corner.x + inset}
                    y={corner.y + inset}
                    width={artW}
                    height={artH}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#clip-${placement.posterId})`}
                  />
                )}
                <ellipse
                  cx={corner.x + frameW / 2}
                  cy={corner.y + frameH / 2}
                  rx={frameW / 2}
                  ry={frameH / 2}
                  fill="none"
                  stroke={dragging === placement.posterId ? 'var(--canvas-selected)' : 'var(--poster-outline)'}
                  strokeWidth={dragging === placement.posterId ? 2 : 1}
                />
              </>
            ) : (
              <>
                <rect
                  x={corner.x}
                  y={corner.y}
                  width={frameW}
                  height={frameH}
                  fill={poster.frameColor}
                />
                {href === undefined ? (
                  <>
                    <rect
                      x={corner.x + inset}
                      y={corner.y + inset}
                      width={artW}
                      height={artH}
                      fill="var(--poster-blank)"
                    />
                    <text
                      x={corner.x + frameW / 2}
                      y={corner.y + frameH / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.max(9, Math.min(15, artW / 8))}
                      fill="var(--poster-blank-ink)"
                    >
                      {poster.name}
                    </text>
                  </>
                ) : (
                  <image
                    href={href}
                    x={corner.x + inset}
                    y={corner.y + inset}
                    width={artW}
                    height={artH}
                    preserveAspectRatio="xMidYMid slice"
                  />
                )}
                <rect
                  x={corner.x}
                  y={corner.y}
                  width={frameW}
                  height={frameH}
                  fill="none"
                  stroke={dragging === placement.posterId ? 'var(--canvas-selected)' : 'var(--poster-outline)'}
                  strokeWidth={dragging === placement.posterId ? 2 : 1}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
