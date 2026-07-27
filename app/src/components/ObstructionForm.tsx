import { parseLength } from '@pwe/layout-engine';
import type { Obstruction, ObstructionKind, Wall } from '@pwe/shared';
import { useState } from 'react';

const KINDS: ObstructionKind[] = ['door', 'window', 'outlet', 'generic'];

export interface ObstructionFormProps {
  wall: Wall;
  onSubmit: (obstruction: Obstruction) => void;
}

export function ObstructionForm({ wall, onSubmit }: ObstructionFormProps) {
  const [kind, setKind] = useState<ObstructionKind>('door');
  const [label, setLabel] = useState('');
  const [xIn, setXIn] = useState('0');
  const [yIn, setYIn] = useState('0');
  const [widthIn, setWidthIn] = useState('32');
  const [heightIn, setHeightIn] = useState('80');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // parseLength accepts both `32` and `2' 8"`, so the same field serves
    // either habit without a separate unit toggle.
    const x = parseLength(xIn);
    const y = parseLength(yIn);
    const w = parseLength(widthIn);
    const h = parseLength(heightIn);

    if (x === null || y === null || w === null || h === null) {
      setError('Enter each measurement as inches (32) or feet and inches (2\' 8").');
      return;
    }
    if (w <= 0 || h <= 0) {
      setError('Width and height must be greater than zero.');
      return;
    }
    if (x + w > wall.widthIn || y + h > wall.heightIn) {
      setError(`That does not fit — the wall is ${wall.widthIn}" by ${wall.heightIn}".`);
      return;
    }

    onSubmit({
      id: crypto.randomUUID(),
      kind,
      label: label.trim(),
      xIn: x,
      yIn: y,
      widthIn: w,
      heightIn: h,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Add an obstruction</h3>

      <label htmlFor="obs-kind">Type</label>
      <select
        id="obs-kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as ObstructionKind)}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>

      <label htmlFor="obs-label">Label</label>
      <input id="obs-label" value={label} onChange={(e) => setLabel(e.target.value)} />

      <label htmlFor="obs-x">From left</label>
      <input id="obs-x" value={xIn} onChange={(e) => setXIn(e.target.value)} />

      <label htmlFor="obs-y">From floor</label>
      <input id="obs-y" value={yIn} onChange={(e) => setYIn(e.target.value)} />

      <label htmlFor="obs-width">Width</label>
      <input id="obs-width" value={widthIn} onChange={(e) => setWidthIn(e.target.value)} />

      <label htmlFor="obs-height">Height</label>
      <input id="obs-height" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />

      {error !== null && <p role="alert">{error}</p>}

      <button type="submit">Add obstruction</button>
    </form>
  );
}
