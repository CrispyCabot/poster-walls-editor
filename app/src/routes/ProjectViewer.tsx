import { type LengthMode, formatLength } from '@pwe/layout-engine';
import { useState } from 'react';
import { Link } from 'react-router';
import type { ProjectView } from '../api/queries.js';
import { WallCanvas } from '../components/WallCanvas.js';

const VIEWPORT = { width: 1400, height: 900, padding: 40 };

/**
 * Read-only rendering of a project you do not own.
 *
 * Shares WallCanvas with the editor so a public wall looks exactly as its
 * author sees it. Dragging is neutralised by ignoring the move callback rather
 * than by a separate component — one renderer, one source of truth for how a
 * wall looks.
 */
export function ProjectViewer({ view }: { view: ProjectView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [lengthMode, setLengthMode] = useState<LengthMode>('inches');

  const walls = view.walls;
  const active = walls.find((w) => w.id === selected) ?? walls[0];
  const placements = active === undefined ? [] : (view.placementsByWall[active.id] ?? []);

  return (
    <div className="page">
      <div className="pagehead">
        <div>
          <h1>{view.project.name}</h1>
          <span className="muted">A public wall — you are viewing, not editing.</span>
        </div>
        <Link to="/">Browse more walls →</Link>
      </div>

      {walls.length === 0 ? (
        <div className="empty">This project has no walls yet.</div>
      ) : (
        <>
          <div className="stagebar" style={{ marginBottom: 12 }}>
            {walls.length > 1 &&
              walls.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="btn--small btn--tab"
                  aria-pressed={active?.id === w.id}
                  onClick={() => setSelected(w.id)}
                >
                  {w.name}
                </button>
              ))}

            {active !== undefined && (
              <span className="muted">
                {formatLength(active.widthIn, lengthMode)} ×{' '}
                {formatLength(active.heightIn, lengthMode)}
              </span>
            )}

            <button
              type="button"
              className="btn--small btn--tab"
              aria-pressed={lengthMode === 'feet-inches'}
              onClick={() =>
                setLengthMode(lengthMode === 'inches' ? 'feet-inches' : 'inches')
              }
            >
              {lengthMode === 'inches' ? 'Feet & inches' : 'Inches'}
            </button>
          </div>

          {active !== undefined && (
            <div className="stage" style={{ aspectRatio: '14 / 9' }}>
              <WallCanvas
                wall={active}
                posters={view.posters}
                placements={placements}
                viewport={VIEWPORT}
                lengthMode={lengthMode}
                // Read-only: a drag resolves, then goes nowhere.
                onMove={() => undefined}
              />
            </div>
          )}

          {view.posters.length > 0 && (
            <>
              <h3 style={{ marginTop: 24 }}>Posters on this wall</h3>
              <ul className="list">
                {view.posters.map((p) => (
                  <li className="item" key={p.id}>
                    <span
                      className="swatch"
                      style={{ background: p.frameColor }}
                      aria-hidden="true"
                    />
                    <span className="item__name">{p.name}</span>
                    <span className="muted">
                      {formatLength(p.widthIn, lengthMode)} ×{' '}
                      {formatLength(p.heightIn, lengthMode)}
                      {p.frameWidthIn > 0 &&
                        ` · ${formatLength(p.frameWidthIn, lengthMode)} frame`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
