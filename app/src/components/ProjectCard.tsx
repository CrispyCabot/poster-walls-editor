import { fitToViewport, outerSize, wallToScreen } from '@pwe/layout-engine';
import type { ProjectPreview } from '@pwe/shared';
import { Link } from 'react-router';
import { getConfig } from '../config.js';

const THUMB = { width: 320, height: 200, padding: 10 };

/**
 * A small, non-interactive rendering of a project's first wall.
 *
 * Deliberately not WallCanvas: that component owns dragging, snapping, and
 * pointer capture, none of which a thumbnail wants. Sharing it would mean
 * threading "is this interactive" through every branch of it.
 */
function Thumbnail({ preview }: { preview: ProjectPreview }) {
  const { wall } = preview;

  if (wall === null) {
    return <div className="card__thumb card__thumb--empty">No wall yet</div>;
  }

  const size = { width: wall.widthIn, height: wall.heightIn };
  const fit = fitToViewport(size, THUMB);
  const topLeft = wallToScreen({ x: 0, y: wall.heightIn }, size, fit);
  const byId = new Map(preview.posters.map((p) => [p.id, p]));

  return (
    <svg
      className="card__thumb"
      viewBox={`0 0 ${THUMB.width} ${THUMB.height}`}
      role="img"
      aria-label={`${wall.name}: ${preview.placements.length} posters on a ${wall.widthIn} by ${wall.heightIn} inch wall`}
    >
      <rect
        x={topLeft.x}
        y={topLeft.y}
        width={wall.widthIn * fit.scale}
        height={wall.heightIn * fit.scale}
        fill={wall.backgroundColor}
        stroke="var(--canvas-edge)"
        strokeWidth={1}
      />

      {preview.placements.map((placement) => {
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
        const w = outer.width * fit.scale;
        const h = outer.height * fit.scale;
        const inset = poster.frameWidthIn * fit.scale;
        const href =
          poster.imageKey === undefined
            ? undefined
            : `${getConfig().imageBaseUrl}/i/${poster.imageKey}`;

        const round = poster.shape === 'circle';

        return (
          <g key={placement.posterId}>
            {round ? (
              <ellipse
                cx={corner.x + w / 2}
                cy={corner.y + h / 2}
                rx={w / 2}
                ry={h / 2}
                fill={poster.frameColor}
              />
            ) : (
              <rect x={corner.x} y={corner.y} width={w} height={h} fill={poster.frameColor} />
            )}
            {href !== undefined && (
              <image
                href={href}
                x={corner.x + inset}
                y={corner.y + inset}
                width={poster.widthIn * fit.scale}
                height={poster.heightIn * fit.scale}
                preserveAspectRatio="xMidYMid slice"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export interface ProjectCardProps {
  preview: ProjectPreview;
  /** Owner-only controls are hidden when browsing someone else's work. */
  onDelete?: (projectId: string) => void;
}

export function ProjectCard({ preview, onDelete }: ProjectCardProps) {
  const posterCount = preview.placements.length;

  return (
    <article className="projectcard">
      <Link to={`/projects/${preview.id}`} className="projectcard__link">
        <Thumbnail preview={preview} />
      </Link>

      <div className="projectcard__foot">
        <span className="projectcard__meta">
          <Link to={`/projects/${preview.id}`} className="projectcard__name">
            {preview.name}
          </Link>
          <span className="muted">
            {preview.wall === null
              ? 'No wall yet'
              : `${preview.wall.widthIn}" × ${preview.wall.heightIn}"`}
            {' · '}
            {posterCount} {posterCount === 1 ? 'poster' : 'posters'}
          </span>
        </span>

        {onDelete !== undefined && (
          <button
            type="button"
            className="btn--danger"
            aria-label={`Delete ${preview.name}`}
            onClick={() => onDelete(preview.id)}
          >
            ✕
          </button>
        )}
      </div>
    </article>
  );
}
