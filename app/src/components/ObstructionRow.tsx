import { type LengthMode, formatLength, parseLength } from '@pwe/layout-engine';
import type { Obstruction, ObstructionKind, Wall } from '@pwe/shared';
import { useState } from 'react';

const KINDS: ObstructionKind[] = ['door', 'window', 'outlet', 'generic'];

/** The six numbers a row edits. Two of them are derived from the other four. */
type Field = 'widthIn' | 'heightIn' | 'xIn' | 'yIn' | 'rightIn' | 'topIn';

const LABELS: Record<Field, string> = {
  widthIn: 'Width',
  heightIn: 'Height',
  xIn: 'From left',
  yIn: 'From floor',
  rightIn: 'Right edge',
  topIn: 'Top edge',
};

const ORDER: Field[] = ['widthIn', 'heightIn', 'xIn', 'yIn', 'rightIn', 'topIn'];

interface Box {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

function derive(box: Box): Record<Field, number> {
  return {
    widthIn: box.widthIn,
    heightIn: box.heightIn,
    xIn: box.xIn,
    yIn: box.yIn,
    rightIn: box.xIn + box.widthIn,
    topIn: box.yIn + box.heightIn,
  };
}

/**
 * Applies one edited field, deciding what gives.
 *
 * **Position fields move it; edge fields resize it.** Setting "from left"
 * slides the whole obstruction and keeps its width. Setting "right edge" pins
 * the left where it is and changes the width to reach the new edge. That is
 * the reading that matches how you measure a wall: you know where a door
 * starts and where it ends, and the width is whatever falls out.
 */
function apply(box: Box, field: Field, value: number): Box {
  switch (field) {
    case 'widthIn':
      return { ...box, widthIn: value };
    case 'heightIn':
      return { ...box, heightIn: value };
    case 'xIn':
      return { ...box, xIn: value };
    case 'yIn':
      return { ...box, yIn: value };
    case 'rightIn':
      return { ...box, widthIn: value - box.xIn };
    case 'topIn':
      return { ...box, heightIn: value - box.yIn };
  }
}

function problemWith(box: Box, wall: Wall): string | null {
  if (!(box.widthIn > 0) || !(box.heightIn > 0)) {
    return 'Width and height must be greater than zero.';
  }
  if (box.xIn < 0 || box.yIn < 0) {
    return 'An obstruction cannot start off the wall.';
  }
  if (box.xIn + box.widthIn > wall.widthIn || box.yIn + box.heightIn > wall.heightIn) {
    return `That runs past the edge. ${wall.name} is ${wall.widthIn}" by ${wall.heightIn}".`;
  }
  return null;
}

export interface ObstructionRowProps {
  obstruction: Obstruction;
  wall: Wall;
  lengthMode: LengthMode;
  onChange: (next: Obstruction) => void;
  onRemove: () => void;
}

export function ObstructionRow({
  obstruction,
  wall,
  lengthMode,
  onChange,
  onRemove,
}: ObstructionRowProps) {
  const [box, setBox] = useState<Box>({
    xIn: obstruction.xIn,
    yIn: obstruction.yIn,
    widthIn: obstruction.widthIn,
    heightIn: obstruction.heightIn,
  });
  const [label, setLabel] = useState(obstruction.label);
  const [kind, setKind] = useState<ObstructionKind>(obstruction.kind);

  // The field being typed in keeps the user's raw text; every other field
  // re-renders from the recomputed box, which is what makes editing the right
  // edge visibly move the width.
  const [editing, setEditing] = useState<Field | null>(null);
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  const values = derive(box);

  function commit(next: Box, nextLabel = label, nextKind = kind) {
    const problem = problemWith(next, wall);
    setError(problem);
    if (problem !== null) return;

    setBox(next);
    onChange({
      id: obstruction.id,
      kind: nextKind,
      label: nextLabel,
      xIn: Math.round(next.xIn * 100) / 100,
      yIn: Math.round(next.yIn * 100) / 100,
      widthIn: Math.round(next.widthIn * 100) / 100,
      heightIn: Math.round(next.heightIn * 100) / 100,
    });
  }

  function onFieldChange(field: Field, text: string) {
    setRaw(text);
    const parsed = parseLength(text);
    if (parsed === null) return;

    const next = apply(box, field, parsed);
    const problem = problemWith(next, wall);
    setError(problem);
    // Update the visible numbers even while invalid, so it is obvious *why*
    // it is invalid rather than the field silently refusing to move.
    setBox(next);
  }

  function onFieldBlur() {
    setEditing(null);
    setRaw('');
    // Only persist a state that actually makes sense on the wall.
    if (problemWith(box, wall) === null) commit(box);
  }

  return (
    <li className="item obsrow">
      <div className="obsrow__head">
        <select
          value={kind}
          aria-label="Type"
          onChange={(e) => {
            const next = e.target.value as ObstructionKind;
            setKind(next);
            commit(box, label, next);
          }}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>

        <input
          className="obsrow__label"
          value={label}
          aria-label="Label"
          placeholder="Unlabelled"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => commit(box)}
        />

        <button
          type="button"
          className="btn--danger"
          aria-label={`Remove ${obstruction.label || obstruction.kind}`}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>

      <dl className="measures">
        {ORDER.map((field) => (
          <div key={field}>
            <dt>
              <label htmlFor={`${obstruction.id}-${field}`}>{LABELS[field]}</label>
            </dt>
            <dd>
              <input
                id={`${obstruction.id}-${field}`}
                className="obsrow__num"
                value={
                  editing === field ? raw : formatLength(values[field], lengthMode)
                }
                onFocus={() => {
                  setEditing(field);
                  setRaw(String(values[field]));
                }}
                onChange={(e) => onFieldChange(field, e.target.value)}
                onBlur={onFieldBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </dd>
          </div>
        ))}
      </dl>

      {error !== null && (
        <p className="notice notice--alert" role="alert">{error}</p>
      )}
    </li>
  );
}
