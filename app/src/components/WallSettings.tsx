import { outerSize, parseLength } from '@pwe/layout-engine';
import type { Placement, Poster, Wall } from '@pwe/shared';
import { useState } from 'react';

export interface WallSettingsProps {
  wall: Wall;
  posters: Poster[];
  placements: Placement[];
  isSaving: boolean;
  onSave: (wall: { name: string; widthIn: number; heightIn: number }) => void;
  /** Called with corrected placements when a resize pushes posters off the wall. */
  onReflow: (placements: Placement[]) => void;
}

/**
 * Edits the active wall's name and dimensions.
 *
 * Mount this with `key={wall.id}` so selecting a different wall remounts it and
 * the fields reset — otherwise the form keeps the previous wall's numbers.
 */
export function WallSettings({
  wall,
  posters,
  placements,
  isSaving,
  onSave,
  onReflow,
}: WallSettingsProps) {
  const [name, setName] = useState(wall.name);
  const [widthIn, setWidthIn] = useState(String(wall.widthIn));
  const [heightIn, setHeightIn] = useState(String(wall.heightIn));
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(posters.map((p) => [p.id, p]));

  /**
   * Posters that would fall outside the new wall, pulled back inside it.
   *
   * Shrinking a wall would otherwise strand frames past its edge, where they
   * still render but describe a position that cannot exist.
   */
  function reflow(w: number, h: number): Placement[] {
    return placements.map((placement) => {
      const poster = byId.get(placement.posterId);
      if (poster === undefined) return placement;

      const outer = outerSize({
        width: poster.widthIn,
        height: poster.heightIn,
        frameWidth: poster.frameWidthIn,
      });
      const halfW = outer.width / 2;
      const halfH = outer.height / 2;

      return {
        posterId: placement.posterId,
        // Math.max keeps a poster wider than the wall centred rather than
        // pushing it off the opposite edge.
        centerXIn: Math.max(halfW, Math.min(placement.centerXIn, w - halfW)),
        centerYIn: Math.max(halfH, Math.min(placement.centerYIn, h - halfH)),
      };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const w = parseLength(widthIn);
    const h = parseLength(heightIn);

    if (name.trim() === '') {
      setError('Give the wall a name.');
      return;
    }
    if (w === null || h === null) {
      setError('Enter dimensions in inches (96) or feet and inches (8\').');
      return;
    }
    if (!(w > 0) || !(h > 0)) {
      setError('Width and height must be greater than zero.');
      return;
    }

    const stranded = wall.obstructions.filter(
      (o) => o.xIn + o.widthIn > w || o.yIn + o.heightIn > h,
    );
    if (stranded.length > 0) {
      setError(
        `That is too small for ${stranded.length === 1 ? 'an obstruction' : `${stranded.length} obstructions`} already on this wall. Remove or move ${stranded.map((o) => o.label || o.kind).join(', ')} first.`,
      );
      return;
    }

    onSave({ name: name.trim(), widthIn: w, heightIn: h });

    const corrected = reflow(w, h);
    const moved = corrected.some(
      (c, i) =>
        c.centerXIn !== placements[i]?.centerXIn ||
        c.centerYIn !== placements[i]?.centerYIn,
    );
    if (moved) onReflow(corrected);
  }

  const changed =
    name !== wall.name ||
    widthIn !== String(wall.widthIn) ||
    heightIn !== String(wall.heightIn);

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>Wall settings</h3>
      <div className="fields">
        <div className="field field--full">
          <label htmlFor="edit-wall-name">Name</label>
          <input
            id="edit-wall-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field field--num">
          <label htmlFor="edit-wall-width">Width</label>
          <input
            id="edit-wall-width"
            value={widthIn}
            onChange={(e) => setWidthIn(e.target.value)}
          />
        </div>

        <div className="field field--num">
          <label htmlFor="edit-wall-height">Height</label>
          <input
            id="edit-wall-height"
            value={heightIn}
            onChange={(e) => setHeightIn(e.target.value)}
          />
        </div>

        <button type="submit" className="btn--primary btn--small" disabled={!changed || isSaving}>
          {isSaving ? 'Saving' : 'Save wall'}
        </button>

        {changed && (
          <button
            type="button"
            className="btn--small"
            onClick={() => {
              setName(wall.name);
              setWidthIn(String(wall.widthIn));
              setHeightIn(String(wall.heightIn));
              setError(null);
            }}
          >
            Reset
          </button>
        )}
      </div>

      {error !== null && (
        <p className="notice notice--alert" role="alert">{error}</p>
      )}
    </form>
  );
}
