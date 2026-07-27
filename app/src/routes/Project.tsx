import { type LengthMode, type SnapOptions, formatLength } from '@pwe/layout-engine';
import type { Obstruction, Placement } from '@pwe/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useAddPoster,
  useAddWall,
  useDeletePoster,
  usePlacements,
  usePosters,
  useProject,
  useProjectView,
  useRemoveWall,
  useSavePlacements,
  useUpdatePoster,
  useUpdateProject,
  useUpdateWall,
  useUploadImage,
} from '../api/queries.js';
import { ObstructionForm } from '../components/ObstructionForm.js';
import { ObstructionRow } from '../components/ObstructionRow.js';
import { PosterPanel } from '../components/PosterPanel.js';
import { WallCanvas } from '../components/WallCanvas.js';
import { WallSettings } from '../components/WallSettings.js';
import { ProjectViewer } from './ProjectViewer.js';

/** Large fixed drawing surface; CSS scales it down to fit the stage. */
const VIEWPORT = { width: 1400, height: 900, padding: 40 };

export function Project() {
  const { id = '' } = useParams();
  const view = useProjectView(id);

  // One read decides everything: owners get the editor, everyone else gets the
  // read-only viewer, and a project that is neither theirs nor public 404s.
  if (view.isLoading) return <p className="notice">Loading project…</p>;
  if (view.error !== null) {
    return (
      <p className="notice notice--alert" role="alert">
        Could not open this project. {(view.error as Error).message}
      </p>
    );
  }
  if (view.data === undefined) return <p className="notice">Loading project…</p>;
  if (!view.data.isOwner) return <ProjectViewer view={view.data} />;

  return <ProjectEditor id={id} />;
}

function ProjectEditor({ id }: { id: string }) {
  const { data, isLoading, error } = useProject(id);

  const [selected, setSelected] = useState<string | null>(null);
  const [lengthMode, setLengthMode] = useState<LengthMode>('inches');
  const [showSetup, setShowSetup] = useState(false);
  const [snapOn, setSnapOn] = useState(true);

  // Threshold 0 turns snapping off without changing any other behaviour.
  const snapOptions: SnapOptions = snapOn
    ? { threshold: 1.5, gridIn: 0 }
    : { threshold: 0, gridIn: 0 };

  const walls = data?.walls ?? [];
  const active = walls.find((w) => w.id === selected) ?? walls[0];

  const addWall = useAddWall(id);
  const updateWall = useUpdateWall(id);
  const removeWall = useRemoveWall(id);
  const posters = usePosters(id);
  const addPoster = useAddPoster(id);
  const deletePoster = useDeletePoster(id);
  const updatePoster = useUpdatePoster(id);
  const updateProject = useUpdateProject(id);
  const uploadImage = useUploadImage(id);
  const placements = usePlacements(id, active?.id);
  const savePlacements = useSavePlacements(id, active?.id);

  const [wallName, setWallName] = useState('');
  const [wallWidth, setWallWidth] = useState('144');
  const [wallHeight, setWallHeight] = useState('96');

  if (isLoading) return <p className="notice">Loading project…</p>;
  if (error) {
    return (
      <p className="notice notice--alert" role="alert">
        Could not load this project. {(error as Error).message}
      </p>
    );
  }

  const posterList = posters.data?.posters ?? [];
  const current = placements.data?.placements ?? [];
  const placedIds = new Set(current.map((p) => p.posterId));

  const writePlacements = (next: Placement[]) => savePlacements.mutate(next);

  const replaceWall = (
    patch: Partial<{
      name: string;
      widthIn: number;
      heightIn: number;
      backgroundColor: string;
      obstructions: Obstruction[];
    }>,
  ) => {
    if (active === undefined) return;
    updateWall.mutate({
      wallId: active.id,
      wall: {
        name: patch.name ?? active.name,
        widthIn: patch.widthIn ?? active.widthIn,
        heightIn: patch.heightIn ?? active.heightIn,
        obstructions: patch.obstructions ?? active.obstructions,
        backgroundColor: patch.backgroundColor ?? active.backgroundColor,
      },
    });
  };

  return (
    <div className="workspace">
      <aside className="workspace__side">
        <p style={{ marginTop: 0 }}>
          <Link to="/projects">← All projects</Link>
        </p>
        <h1>{data?.project.name}</h1>

        <h3 style={{ marginTop: 20 }}>Walls</h3>
        {walls.length === 0 ? (
          <p className="muted">Add a wall to start.</p>
        ) : (
          <ul className="list">
            {walls.map((w) => (
              <li className="item" key={w.id}>
                <button
                  type="button"
                  className="btn--tab btn--small"
                  aria-pressed={active?.id === w.id}
                  onClick={() => setSelected(w.id)}
                >
                  {w.name}
                </button>
                <span className="item__name muted">
                  {formatLength(w.widthIn, lengthMode)} × {formatLength(w.heightIn, lengthMode)}
                </span>
                <button
                  type="button"
                  className="btn--danger"
                  aria-label={`Delete ${w.name}`}
                  onClick={() => removeWall.mutate(w.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="card"
          style={{ marginTop: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            const w = Number(wallWidth);
            const h = Number(wallHeight);
            if (wallName.trim() === '' || !(w > 0) || !(h > 0)) return;
            addWall.mutate({ name: wallName.trim(), widthIn: w, heightIn: h });
            setWallName('');
          }}
        >
          <h3>Add a wall</h3>
          <div className="fields">
            <div className="field field--full">
              <label htmlFor="wall-name">Name</label>
              <input
                id="wall-name"
                value={wallName}
                placeholder="North wall"
                onChange={(e) => setWallName(e.target.value)}
              />
            </div>
            <div className="field field--num">
              <label htmlFor="wall-width">Width (in)</label>
              <input id="wall-width" value={wallWidth} onChange={(e) => setWallWidth(e.target.value)} />
            </div>
            <div className="field field--num">
              <label htmlFor="wall-height">Height (in)</label>
              <input id="wall-height" value={wallHeight} onChange={(e) => setWallHeight(e.target.value)} />
            </div>
            <button type="submit" className="btn--primary btn--small" disabled={addWall.isPending}>
              Add wall
            </button>
          </div>
        </form>

        {active !== undefined && (
          <WallSettings
            key={active.id}
            wall={active}
            posters={posterList}
            placements={current}
            isSaving={updateWall.isPending}
            onSave={(next) => replaceWall(next)}
            onReflow={writePlacements}
          />
        )}

        {active !== undefined && (
          <div style={{ marginTop: 20 }}>
            <PosterPanel
              posters={posterList}
              placedIds={placedIds}
              isAdding={addPoster.isPending}
              onAdd={(poster) => addPoster.mutate(poster)}
              onDelete={(posterId) => {
                deletePoster.mutate(posterId);
                writePlacements(current.filter((p) => p.posterId !== posterId));
              }}
              onPlace={(posterId) =>
                writePlacements([
                  ...current,
                  {
                    posterId,
                    centerXIn: active.widthIn / 2,
                    // 57" to centre is the standard gallery hanging height.
                    centerYIn: Math.min(57, active.heightIn / 2),
                  },
                ])
              }
              onRemoveFromWall={(posterId) =>
                writePlacements(current.filter((p) => p.posterId !== posterId))
              }
              onUpload={uploadImage}
              onSetImage={(posterId, imageKey) => {
                const poster = posterList.find((p) => p.id === posterId);
                if (poster === undefined) return;
                // A full replace keeps the id, so existing placements survive.
                updatePoster.mutate({
                  posterId,
                  poster: {
                    name: poster.name,
                    widthIn: poster.widthIn,
                    heightIn: poster.heightIn,
                    frameWidthIn: poster.frameWidthIn,
                    frameColor: poster.frameColor,
                    shape: poster.shape,
                    imageKey,
                  },
                });
              }}
            />
          </div>
        )}
      </aside>

      <section className="workspace__main">
        {active === undefined ? (
          <div className="empty">Add a wall and it will be drawn here to scale.</div>
        ) : (
          <>
            <div className="stagebar">
              <strong>{active.name}</strong>
              <span className="muted">
                {formatLength(active.widthIn, lengthMode)} × {formatLength(active.heightIn, lengthMode)}
              </span>
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

              <label htmlFor="wall-bg" className="muted">Wall colour</label>
              <input
                id="wall-bg"
                type="color"
                style={{ width: 44 }}
                value={active.backgroundColor}
                onChange={(e) => replaceWall({ backgroundColor: e.target.value })}
              />

              <button
                type="button"
                className="btn--small btn--tab"
                aria-pressed={snapOn}
                onClick={() => setSnapOn(!snapOn)}
              >
                Snap
              </button>

              <span className="stagebar__spacer" />

              <button
                type="button"
                className="btn--small btn--tab"
                aria-pressed={data?.project.visibility === 'public'}
                title="Public projects appear in Browse walls for everyone"
                onClick={() => {
                  const project = data?.project;
                  if (project === undefined) return;
                  updateProject.mutate({
                    name: project.name,
                    visibility: project.visibility === 'public' ? 'private' : 'public',
                    version: project.version,
                  });
                }}
              >
                {data?.project.visibility === 'public' ? 'Public' : 'Private'}
              </button>

              <button
                type="button"
                className="btn--small btn--tab"
                aria-pressed={showSetup}
                onClick={() => setShowSetup(!showSetup)}
              >
                {showSetup ? 'Hide obstructions' : 'Obstructions'}
              </button>
            </div>

            <div className="stage">
              <WallCanvas
                wall={active}
                posters={posterList}
                placements={current}
                viewport={VIEWPORT}
                lengthMode={lengthMode}
                snapOptions={snapOptions}
                onMove={(posterId, centerXIn, centerYIn) =>
                  writePlacements(
                    current.map((p) =>
                      p.posterId === posterId ? { posterId, centerXIn, centerYIn } : p,
                    ),
                  )
                }
              />
            </div>

            {showSetup && (
              <div>
                <ObstructionForm
                  wall={active}
                  onSubmit={(obstruction) =>
                    replaceWall({ obstructions: [...active.obstructions, obstruction] })
                  }
                />
                {active.obstructions.length > 0 && (
                  <ul className="list">
                    {active.obstructions.map((o) => (
                      <ObstructionRow
                        key={o.id}
                        obstruction={o}
                        wall={active}
                        lengthMode={lengthMode}
                        onChange={(next) =>
                          replaceWall({
                            obstructions: active.obstructions.map((x) =>
                              x.id === next.id ? next : x,
                            ),
                          })
                        }
                        onRemove={() =>
                          replaceWall({
                            obstructions: active.obstructions.filter((x) => x.id !== o.id),
                          })
                        }
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
