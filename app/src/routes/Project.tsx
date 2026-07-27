import { type LengthMode, formatLength } from '@pwe/layout-engine';
import type { Obstruction } from '@pwe/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  useAddWall,
  useProject,
  useRemoveWall,
  useUpdateWall,
} from '../api/queries.js';
import { ObstructionForm } from '../components/ObstructionForm.js';
import { WallCanvas } from '../components/WallCanvas.js';

const VIEWPORT = { width: 760, height: 460, padding: 48 };

export function Project() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useProject(id);
  const addWall = useAddWall(id);
  const updateWall = useUpdateWall(id);
  const removeWall = useRemoveWall(id);

  const [name, setName] = useState('');
  const [widthIn, setWidthIn] = useState('144');
  const [heightIn, setHeightIn] = useState('96');
  const [selected, setSelected] = useState<string | null>(null);
  const [lengthMode, setLengthMode] = useState<LengthMode>('inches');

  if (isLoading) return <p className="notice">Loading project…</p>;
  if (error) {
    return (
      <p className="notice notice--alert" role="alert">
        Could not load this project. {(error as Error).message}
      </p>
    );
  }

  const walls = data?.walls ?? [];
  const active = walls.find((w) => w.id === selected) ?? walls[0];

  /** Obstructions live inside the wall item, so any change replaces the wall. */
  const replaceObstructions = (obstructions: Obstruction[]) => {
    if (active === undefined) return;
    updateWall.mutate({
      wallId: active.id,
      wall: {
        name: active.name,
        widthIn: active.widthIn,
        heightIn: active.heightIn,
        obstructions,
      },
    });
  };

  return (
    <div className="sheet">
      <div className="titleblock">
        <div>
          <span className="eyebrow">
            <Link to="/projects">← All projects</Link>
          </span>
          <h1>{data?.project.name}</h1>
        </div>
        <span className="meta">
          {walls.length} {walls.length === 1 ? 'wall' : 'walls'}
        </span>
      </div>

      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const w = Number(widthIn);
          const h = Number(heightIn);
          if (name.trim() === '' || !(w > 0) || !(h > 0)) return;
          addWall.mutate({ name: name.trim(), widthIn: w, heightIn: h });
          setName('');
        }}
      >
        <h3>Measure a wall</h3>
        <div className="fields">
          <div className="field field--grow">
            <label htmlFor="wall-name">Wall</label>
            <input
              id="wall-name"
              value={name}
              placeholder="North wall"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field field--num">
            <label htmlFor="wall-width">Width (in)</label>
            <input id="wall-width" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} />
          </div>
          <div className="field field--num">
            <label htmlFor="wall-height">Height (in)</label>
            <input id="wall-height" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
          </div>
          <button type="submit" className="btn--primary" disabled={addWall.isPending}>
            {addWall.isPending ? 'Adding' : 'Add wall'}
          </button>
        </div>
      </form>

      {walls.length === 0 ? (
        <div className="empty">
          <strong>No walls yet</strong>
          Measure a wall above and it will be drawn to scale.
        </div>
      ) : (
        <>
          <ul className="stack">
            {walls.map((w) => (
              <li className="row" key={w.id}>
                <span className="row__name">
                  <button
                    type="button"
                    className="btn--tab"
                    aria-pressed={active?.id === w.id}
                    onClick={() => setSelected(w.id)}
                  >
                    {w.name}
                  </button>
                </span>
                <span className="meta">
                  {formatLength(w.widthIn, lengthMode)} × {formatLength(w.heightIn, lengthMode)}
                </span>
                <button
                  type="button"
                  className="btn--quiet"
                  aria-label={`Delete ${w.name}`}
                  onClick={() => removeWall.mutate(w.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>

          {active !== undefined && (
            <>
              <div className="drawing">
                <WallCanvas wall={active} viewport={VIEWPORT} lengthMode={lengthMode} />
              </div>

              <button
                type="button"
                className="btn--tab"
                aria-pressed={lengthMode === 'feet-inches'}
                onClick={() =>
                  setLengthMode(lengthMode === 'inches' ? 'feet-inches' : 'inches')
                }
              >
                {lengthMode === 'inches' ? 'Show feet and inches' : 'Show inches'}
              </button>

              <ObstructionForm
                wall={active}
                onSubmit={(obstruction) =>
                  replaceObstructions([...active.obstructions, obstruction])
                }
              />

              {active.obstructions.length > 0 && (
                <ul className="stack">
                  {active.obstructions.map((o) => (
                    <li className="row" key={o.id}>
                      <span className="row__index">{o.kind}</span>
                      <span className="row__name">{o.label || 'Unlabelled'}</span>
                      <span className="meta">
                        {formatLength(o.widthIn, lengthMode)} × {formatLength(o.heightIn, lengthMode)}
                        {' · '}
                        {formatLength(o.xIn, lengthMode)} from left,{' '}
                        {formatLength(o.yIn, lengthMode)} up
                      </span>
                      <button
                        type="button"
                        className="btn--quiet"
                        aria-label={`Remove ${o.label || o.kind}`}
                        onClick={() =>
                          replaceObstructions(
                            active.obstructions.filter((x) => x.id !== o.id),
                          )
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
