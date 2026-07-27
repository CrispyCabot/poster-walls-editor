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
  door: '#d9c9a8',
  window: '#cfe0ee',
  outlet: '#dcdfe3',
  generic: '#dedbd5',
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

  /** Pointer position in wall inches, accounting for CSS scaling of the SVG. */
  function pointerToWall(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (svg === null) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * viewport.width;
    const py = ((e.clientY - rect.top) / rect.height) * viewport.height;
    return screenToWall({ x: px, y: py }, size, fit);
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
        stroke="#b6bdc4"
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
            stroke="#98a1aa"
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
                  fill="#ffffff"
                />
                <text
                  x={corner.x + frameW / 2}
                  y={corner.y + frameH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={Math.max(9, Math.min(15, artW / 8))}
                  fill="#1a1d21"
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
              stroke={dragging === placement.posterId ? '#2563eb' : 'rgb(0 0 0 / 0.25)'}
              strokeWidth={dragging === placement.posterId ? 2 : 1}
            />
          </g>
        );
      })}
    </svg>
  );
}
