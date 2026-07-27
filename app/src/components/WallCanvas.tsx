import {
  type LengthMode,
  type Viewport,
  fitToViewport,
  formatLength,
  wallToScreen,
} from '@pwe/layout-engine';
import type { Obstruction, Wall } from '@pwe/shared';

const KIND_FILL: Record<Obstruction['kind'], string> = {
  door: '#c9b28a',
  window: '#a8c8e0',
  outlet: '#d0d0d0',
  generic: '#cfcfcf',
};

export interface WallCanvasProps {
  wall: Wall;
  viewport: Viewport;
  lengthMode: LengthMode;
}

export function WallCanvas({ wall, viewport, lengthMode }: WallCanvasProps) {
  const size = { width: wall.widthIn, height: wall.heightIn };
  const fit = fitToViewport(size, viewport);

  // Top-left of the drawn wall, in screen pixels.
  const topLeft = wallToScreen({ x: 0, y: wall.heightIn }, size, fit);
  const drawnWidth = wall.widthIn * fit.scale;
  const drawnHeight = wall.heightIn * fit.scale;

  return (
    <svg
      width={viewport.width}
      height={viewport.height}
      role="img"
      aria-label={`${wall.name}, ${formatLength(wall.widthIn, lengthMode)} by ${formatLength(wall.heightIn, lengthMode)}`}
    >
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={drawnWidth}
        height={drawnHeight}
        fill="#faf8f5"
        stroke="#333"
        strokeWidth={2}
      />

      {wall.obstructions.map((o) => {
        // An obstruction's stored y is its BOTTOM edge in wall space, so its
        // screen position comes from its top edge.
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
            stroke="#555"
            strokeWidth={1}
          />
        );
      })}

      <text x={topLeft.x} y={topLeft.y + drawnHeight + 18} fontSize={13}>
        {formatLength(wall.widthIn, lengthMode)} wide
      </text>
      <text x={topLeft.x} y={topLeft.y - 6} fontSize={13}>
        {formatLength(wall.heightIn, lengthMode)} tall
      </text>
    </svg>
  );
}
