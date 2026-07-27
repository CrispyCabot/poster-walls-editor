import {
  type LengthMode,
  type Viewport,
  fitToViewport,
  formatLength,
  wallToScreen,
} from '@pwe/layout-engine';
import type { Obstruction, Wall } from '@pwe/shared';

const KIND_FILL: Record<Obstruction['kind'], string> = {
  door: 'var(--door)',
  window: 'var(--window)',
  outlet: 'var(--outlet)',
  generic: 'var(--generic)',
};

/** One foot. The grid reads proportion at a glance without measuring. */
const GRID_IN = 12;

export interface WallCanvasProps {
  wall: Wall;
  viewport: Viewport;
  lengthMode: LengthMode;
}

/** Extension line + arrowed dimension line + label, as on a real elevation. */
function Dimension({
  from,
  to,
  label,
  axis,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  label: string;
  axis: 'x' | 'y';
}) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const tick = 4;

  return (
    <g stroke="var(--ink-soft)" strokeWidth={1} fill="none">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      {axis === 'x' ? (
        <>
          <line x1={from.x} y1={from.y - tick} x2={from.x} y2={from.y + tick} />
          <line x1={to.x} y1={to.y - tick} x2={to.x} y2={to.y + tick} />
        </>
      ) : (
        <>
          <line x1={from.x - tick} y1={from.y} x2={from.x + tick} y2={from.y} />
          <line x1={to.x - tick} y1={to.y} x2={to.x + tick} y2={to.y} />
        </>
      )}
      <text
        x={axis === 'x' ? mid.x : mid.x - 8}
        y={axis === 'x' ? mid.y + 15 : mid.y}
        textAnchor={axis === 'x' ? 'middle' : 'end'}
        dominantBaseline={axis === 'x' ? 'auto' : 'middle'}
        stroke="none"
        fill="var(--ink)"
        fontFamily="var(--mono)"
        fontSize={11}
        letterSpacing="0.04em"
      >
        {label}
      </text>
    </g>
  );
}

export function WallCanvas({ wall, viewport, lengthMode }: WallCanvasProps) {
  const size = { width: wall.widthIn, height: wall.heightIn };
  const fit = fitToViewport(size, viewport);

  const topLeft = wallToScreen({ x: 0, y: wall.heightIn }, size, fit);
  const drawnWidth = wall.widthIn * fit.scale;
  const drawnHeight = wall.heightIn * fit.scale;
  const bottom = topLeft.y + drawnHeight;

  // Interior foot lines. Skip the outer edges, which the wall border already draws.
  const verticals: number[] = [];
  for (let x = GRID_IN; x < wall.widthIn; x += GRID_IN) verticals.push(x);
  const horizontals: number[] = [];
  for (let y = GRID_IN; y < wall.heightIn; y += GRID_IN) horizontals.push(y);

  return (
    <svg
      width={viewport.width}
      height={viewport.height}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      role="img"
      aria-label={`${wall.name}, ${formatLength(wall.widthIn, lengthMode)} wide by ${formatLength(wall.heightIn, lengthMode)} tall, with ${wall.obstructions.length} obstruction${wall.obstructions.length === 1 ? '' : 's'}`}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 1 1 L 7 4 L 1 7 z" fill="var(--ink-soft)" />
        </marker>
      </defs>

      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={drawnWidth}
        height={drawnHeight}
        fill="var(--sheet)"
        stroke="var(--ink)"
        strokeWidth={1.5}
      />

      <g stroke="var(--grid)" strokeWidth={1}>
        {verticals.map((x) => (
          <line key={`v${x}`} x1={topLeft.x + x * fit.scale} y1={topLeft.y} x2={topLeft.x + x * fit.scale} y2={bottom} />
        ))}
        {horizontals.map((y) => (
          <line key={`h${y}`} x1={topLeft.x} y1={bottom - y * fit.scale} x2={topLeft.x + drawnWidth} y2={bottom - y * fit.scale} />
        ))}
      </g>

      {wall.obstructions.map((o) => {
        // Stored y is the BOTTOM edge in wall space, so screen position comes
        // from the top edge.
        const corner = wallToScreen({ x: o.xIn, y: o.yIn + o.heightIn }, size, fit);
        return (
          <g key={o.id}>
            <rect
              data-testid={`obstruction-${o.id}`}
              aria-label={`${o.kind}: ${o.label}`}
              x={corner.x}
              y={corner.y}
              width={o.widthIn * fit.scale}
              height={o.heightIn * fit.scale}
              fill={KIND_FILL[o.kind]}
              stroke="var(--ink)"
              strokeWidth={1}
            />
            {o.widthIn * fit.scale > 44 && (
              <text
                x={corner.x + (o.widthIn * fit.scale) / 2}
                y={corner.y + (o.heightIn * fit.scale) / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="var(--mono)"
                fontSize={9}
                letterSpacing="0.12em"
                fill="var(--ink-soft)"
              >
                {o.kind.toUpperCase()}
              </text>
            )}
          </g>
        );
      })}

      {/* The signature: real dimension strings, below and to the left. */}
      <Dimension
        axis="x"
        from={{ x: topLeft.x, y: bottom + 20 }}
        to={{ x: topLeft.x + drawnWidth, y: bottom + 20 }}
        label={formatLength(wall.widthIn, lengthMode)}
      />
      <Dimension
        axis="y"
        from={{ x: topLeft.x - 22, y: topLeft.y }}
        to={{ x: topLeft.x - 22, y: bottom }}
        label={formatLength(wall.heightIn, lengthMode)}
      />

      <text
        x={topLeft.x}
        y={topLeft.y - 12}
        fontFamily="var(--mono)"
        fontSize={10}
        letterSpacing="0.2em"
        fill="var(--ink-soft)"
      >
        {wall.name.toUpperCase()} · ELEVATION · 1' GRID
      </text>
    </svg>
  );
}
