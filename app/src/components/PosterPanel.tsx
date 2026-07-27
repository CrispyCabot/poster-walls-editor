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
    shape: 'rect' | 'circle';
    imageKey?: string;
  }) => void;
  onDelete: (posterId: string) => void;
  onPlace: (posterId: string) => void;
  onRemoveFromWall: (posterId: string) => void;
  /** Uploads the file and resolves to the stored image key. */
  onUpload: (file: File) => Promise<string>;
  /** Attaches an already-uploaded image to an existing poster. */
  onSetImage: (posterId: string, imageKey: string) => void;
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
  onSetImage,
}: PosterPanelProps) {
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function attachImage(posterId: string, file: File) {
    setRowError(null);
    setUploadingFor(posterId);
    try {
      onSetImage(posterId, await onUpload(file));
    } catch (err) {
      setRowError(`Could not upload that image. ${(err as Error).message}`);
    } finally {
      setUploadingFor(null);
    }
  }

  const [name, setName] = useState('');
  const [widthIn, setWidthIn] = useState('24');
  const [heightIn, setHeightIn] = useState('36');
  const [frameWidthIn, setFrameWidthIn] = useState('1');
  const [frameColor, setFrameColor] = useState('#000000');
  const [shape, setShape] = useState<'rect' | 'circle'>('rect');
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
        shape,
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
                {/* A label wrapping a hidden input is the accessible way to
                    style a file picker — clicking the label opens it. */}
                <label className="btn--small filebtn" htmlFor={`img-${p.id}`}>
                  {uploadingFor === p.id
                    ? 'Uploading…'
                    : p.imageKey === undefined
                      ? 'Add image'
                      : 'Replace'}
                </label>
                <input
                  id={`img-${p.id}`}
                  className="visually-hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={uploadingFor !== null}
                  onChange={(e) => {
                    const chosen = e.target.files?.[0];
                    if (chosen !== undefined) void attachImage(p.id, chosen);
                    // Reset so picking the same file twice still fires.
                    e.target.value = '';
                  }}
                />
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

      {rowError !== null && (
        <p className="notice notice--alert" role="alert">{rowError}</p>
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

          <div className="field field--num">
            <label htmlFor="poster-shape">Shape</label>
            <select id="poster-shape" value={shape} onChange={(e) => setShape(e.target.value as 'rect' | 'circle')}>
              <option value="rect">Rectangle</option>
              <option value="circle">Circle</option>
            </select>
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
