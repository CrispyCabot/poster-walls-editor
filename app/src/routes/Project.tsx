import type { LengthMode } from '@pwe/layout-engine';
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

const VIEWPORT = { width: 720, height: 480, padding: 32 };

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

  if (isLoading) return <p>Loading project…</p>;
  if (error) {
    return <p role="alert">Could not load this project: {(error as Error).message}</p>;
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
    <main>
      <p><Link to="/projects">All projects</Link></p>
      <h1>{data?.project.name}</h1>

      <button
        type="button"
        onClick={() => setLengthMode(lengthMode === 'inches' ? 'feet-inches' : 'inches')}
      >
        Show {lengthMode === 'inches' ? 'feet and inches' : 'inches'}
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const w = Number(widthIn);
          const h = Number(heightIn);
          if (name.trim() === '' || !(w > 0) || !(h > 0)) return;
          addWall.mutate({ name: name.trim(), widthIn: w, heightIn: h });
          setName('');
        }}
      >
        <h3>Add a wall</h3>
        <label htmlFor="wall-name">Wall name</label>
        <input id="wall-name" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="wall-width">Width (inches)</label>
        <input id="wall-width" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} />

        <label htmlFor="wall-height">Height (inches)</label>
        <input id="wall-height" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />

        <button type="submit" disabled={addWall.isPending}>Add wall</button>
      </form>

      {walls.length === 0 ? (
        <p>No walls yet. Add one above.</p>
      ) : (
        <>
          <ul>
            {walls.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => setSelected(w.id)}>{w.name}</button>{' '}
                <button
                  type="button"
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
              <WallCanvas wall={active} viewport={VIEWPORT} lengthMode={lengthMode} />

              <ObstructionForm
                wall={active}
                onSubmit={(obstruction) =>
                  replaceObstructions([...active.obstructions, obstruction])
                }
              />

              {active.obstructions.length > 0 && (
                <ul>
                  {active.obstructions.map((o) => (
                    <li key={o.id}>
                      {o.kind}: {o.label || '(unlabelled)'}{' '}
                      <button
                        type="button"
                        aria-label={`Remove ${o.label}`}
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
    </main>
  );
}
