import { useState } from 'react';

export interface EditableNameProps {
  value: string;
  isSaving: boolean;
  onSave: (name: string) => void;
  /** Shown under the field when a save fails, e.g. a version conflict. */
  error?: string | null;
  ariaLabel: string;
}

/**
 * A heading you can type into.
 *
 * Styled to read as the heading it replaces rather than as a form field, so the
 * page does not look like a settings screen — but it is a real input, so it is
 * reachable by keyboard and announced properly.
 *
 * Commits on blur or Enter; Escape abandons the edit and restores the saved
 * name.
 */
export function EditableName({
  value,
  isSaving,
  onSave,
  error = null,
  ariaLabel,
}: EditableNameProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  // While not editing, follow the server. Without this a rename made elsewhere
  // — or a failed save — would leave stale text sitting in the box.
  const shown = editing ? draft : value;

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === value) {
      setDraft(value);
      return;
    }
    onSave(trimmed);
  }

  return (
    <>
      <input
        className="editablename"
        aria-label={ariaLabel}
        value={shown}
        disabled={isSaving}
        onFocus={() => {
          setEditing(true);
          setDraft(value);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
            e.currentTarget.blur();
          }
        }}
      />
      {error !== null && (
        <p className="notice notice--alert" role="alert">{error}</p>
      )}
    </>
  );
}
