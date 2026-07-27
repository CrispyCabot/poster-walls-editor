import type { Poster } from '@pwe/shared';
import { useState } from 'react';
import { getConfig } from '../config.js';

export interface PosterPanelProps {
  posters: Poster[];
  placedIds: Set<string>;
  isAdding: boolean;
  onAdd: (poster: {
    name: string;
    widthIn: number;
    heightIn: number;
    frameWidthIn: number;
    frameColor: string;
    imageKey?: string;
  }) => void;
  onDelete: (posterId: string) => void;
  onPlace: (posterId: string) => void;
  onRemoveFromWall: (posterId: string) => void;
  /** Uploads the file and resolves to the stored image key. */
  onUpload: (file: File) => Promise<string>;
}

export function PosterPanel({
  posters,
  placedIds,
  isAdding,
  onAdd,
  onDelete,
  onPlace,
  onRemoveFromWall,
  onUpload,
}: PosterPanelProps) {
  const [name, setName] = useState('');
  const [widthIn, setWidthIn] = useState('24');
  const [heightIn, setHeightIn] = useState('36');
  const [frameWidthIn, setFrameWidthIn] = useState('1');
  const [frameColor, setFrameColor] = useState('#000000');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const w = Number(widthIn);
    const h = Number(heightIn);
    const f = Number(frameWidthIn);

    if (name.trim() === '') {
      setError('Give the poster a name.');
      return;
    }
    if (!(w > 0) || !(h > 0) || !(f >= 0)) {
      setError('Width and height must be greater than zero.');
      return;
    }

    setBusy(true);
    try {
      const imageKey = file === null ? undefined : await onUpload(file);
      onAdd({
        name: name.trim(),
        widthIn: w,
        heightIn: h,
        frameWidthIn: f,
        frameColor,
        ...(imageKey === undefined ? {} : { imageKey }),
      });
      setName('');
      setFile(null);
      // Clear the file input itself, which holds its own value.
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setError(`Could not upload that image. ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3>Posters</h3>

      {posters.length === 0 ? (
        <p className="muted">None yet. Add one below and drag it onto the wall.</p>
      ) : (
        <div>
          {posters.map((p) => {
            const placed = placedIds.has(p.id);
            return (
              <div className="poster-chip" key={p.id}>
                {p.imageKey === undefined ? (
                  <span
                    className="swatch"
                    style={{ background: p.frameColor }}
                    aria-hidden="true"
                  />
                ) : (
                  <img
                    className="thumb"
                    src={`${getConfig().imageBaseUrl}/i/${p.imageKey}`}
                    alt=""
                  />
                )}
                <span className="poster-chip__meta">
                  <span className="poster-chip__name">{p.name}</span>
                  <span className="muted">
                    {p.widthIn}" × {p.heightIn}"
                  </span>
                </span>
                <button
                  type="button"
                  className="btn--small"
                  onClick={() => (placed ? onRemoveFromWall(p.id) : onPlace(p.id))}
                >
                  {placed ? 'Take down' : 'Hang'}
                </button>
                <button
                  type="button"
                  className="btn--danger"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => onDelete(p.id)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <form className="card" onSubmit={(e) => void handleSubmit(e)} style={{ marginTop: 16 }}>
        <h3>Add a poster</h3>
        <div className="fields">
          <div className="field field--full">
            <label htmlFor="poster-name">Name</label>
            <input
              id="poster-name"
              value={name}
              placeholder="Blade Runner"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field field--num">
            <label htmlFor="poster-width">Width (in)</label>
            <input id="poster-width" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} />
          </div>

          <div className="field field--num">
            <label htmlFor="poster-height">Height (in)</label>
            <input id="poster-height" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
          </div>

          <div className="field field--num">
            <label htmlFor="poster-frame">Frame (in)</label>
            <input
              id="poster-frame"
              value={frameWidthIn}
              onChange={(e) => setFrameWidthIn(e.target.value)}
            />
          </div>

          <div className="field field--num">
            <label htmlFor="poster-color">Frame colour</label>
            <input
              id="poster-color"
              type="color"
              value={frameColor}
              onChange={(e) => setFrameColor(e.target.value)}
            />
          </div>

          <div className="field field--full">
            <label htmlFor="poster-image">Image (optional)</label>
            <input
              id="poster-image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <button type="submit" className="btn--primary" disabled={busy || isAdding}>
            {busy ? 'Uploading…' : 'Add poster'}
          </button>
        </div>

        {error !== null && (
          <p className="notice notice--alert" role="alert">{error}</p>
        )}
      </form>
    </>
  );
}
