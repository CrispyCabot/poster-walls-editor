import type { Poster } from '@pwe/shared';

/**
 * Draws one poster — frame, artwork, and outline — in whichever shape it is.
 *
 * Shared by the editor canvas and the preview thumbnail so a diamond looks the
 * same in both. Everything is expressed in screen pixels; callers do the wall
 * space conversion.
 */
export interface PosterShapeProps {
  poster: Poster;
  /** Top-left of the framed poster's bounding box, in pixels. */
  x: number;
  y: number;
  /** Framed size in pixels. */
  width: number;
  height: number;
  /** Frame thickness in pixels. */
  inset: number;
  /** Absolute URL of the artwork, when there is any. */
  href: string | undefined;
  /** Unique per poster; clip paths need ids that do not collide. */
  clipId: string;
  outlineColor: string;
  outlineWidth: number;
  /** Thumbnails skip the name so tiny cards are not covered in text. */
  showName?: boolean;
}

/** A rhombus inscribed in the box: points at top, right, bottom, and left. */
function diamondPoints(x: number, y: number, w: number, h: number): string {
  return [
    `${x + w / 2},${y}`,
    `${x + w},${y + h / 2}`,
    `${x + w / 2},${y + h}`,
    `${x},${y + h / 2}`,
  ].join(' ');
}

export function PosterShape({
  poster,
  x,
  y,
  width,
  height,
  inset,
  href,
  clipId,
  outlineColor,
  outlineWidth,
  showName = true,
}: PosterShapeProps) {
  const artX = x + inset;
  const artY = y + inset;
  const artW = Math.max(0, width - inset * 2);
  const artH = Math.max(0, height - inset * 2);

  // The frame is the full shape; the artwork is the same shape inset by the
  // frame thickness. For a diamond that is an approximation — a true uniform
  // border on a rhombus is not a scaled rhombus — but at these sizes the
  // difference is under a pixel and the construction stays simple.
  const frame =
    poster.shape === 'circle' ? (
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        rx={width / 2}
        ry={height / 2}
        fill={poster.frameColor}
      />
    ) : poster.shape === 'diamond' ? (
      <polygon points={diamondPoints(x, y, width, height)} fill={poster.frameColor} />
    ) : (
      <rect x={x} y={y} width={width} height={height} fill={poster.frameColor} />
    );

  const artClip =
    poster.shape === 'circle' ? (
      <ellipse cx={x + width / 2} cy={y + height / 2} rx={artW / 2} ry={artH / 2} />
    ) : poster.shape === 'diamond' ? (
      <polygon points={diamondPoints(artX, artY, artW, artH)} />
    ) : (
      <rect x={artX} y={artY} width={artW} height={artH} />
    );

  const blank =
    poster.shape === 'circle' ? (
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        rx={artW / 2}
        ry={artH / 2}
        fill="var(--poster-blank)"
      />
    ) : poster.shape === 'diamond' ? (
      <polygon points={diamondPoints(artX, artY, artW, artH)} fill="var(--poster-blank)" />
    ) : (
      <rect x={artX} y={artY} width={artW} height={artH} fill="var(--poster-blank)" />
    );

  const outline =
    poster.shape === 'circle' ? (
      <ellipse
        cx={x + width / 2}
        cy={y + height / 2}
        rx={width / 2}
        ry={height / 2}
        fill="none"
        stroke={outlineColor}
        strokeWidth={outlineWidth}
      />
    ) : poster.shape === 'diamond' ? (
      <polygon
        points={diamondPoints(x, y, width, height)}
        fill="none"
        stroke={outlineColor}
        strokeWidth={outlineWidth}
      />
    ) : (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke={outlineColor}
        strokeWidth={outlineWidth}
      />
    );

  return (
    <>
      {frame}
      {href === undefined ? (
        <>
          {blank}
          {showName && (
            <text
              x={x + width / 2}
              y={y + height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.max(8, Math.min(15, artW / 8))}
              fill="var(--poster-blank-ink)"
            >
              {poster.name}
            </text>
          )}
        </>
      ) : (
        <>
          {/* Non-rectangular artwork has to be clipped, or a diamond's photo
              would spill into the corners its frame does not cover. */}
          <clipPath id={clipId}>{artClip}</clipPath>
          <image
            href={href}
            x={artX}
            y={artY}
            width={artW}
            height={artH}
            preserveAspectRatio="xMidYMid slice"
            clipPath={poster.shape === 'rect' ? undefined : `url(#${clipId})`}
          />
        </>
      )}
      {outline}
    </>
  );
}
