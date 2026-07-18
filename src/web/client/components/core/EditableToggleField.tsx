import React, { useId } from 'react';
import { EditableFieldShell } from './EditableFieldShell.js';

export interface EditableToggleFieldProps {
  label: string;
  value: boolean | undefined;
  initialValue: boolean | undefined;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  id?: string;
  missingValueLabel?: string;
}

export function EditableToggleField({
  label,
  value,
  initialValue,
  onChange,
  disabled = false,
  id,
  missingValueLabel,
}: EditableToggleFieldProps): React.JSX.Element {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const notConfigured = value === undefined;
  const isDisabled = disabled || notConfigured;

  return (
    <EditableFieldShell
      label={label}
      controlId={controlId}
      isDirty={value !== initialValue}
      hint={notConfigured ? (missingValueLabel ?? 'Not configured') : undefined}
    >
      <input
        id={controlId}
        type="checkbox"
        checked={value === true}
        disabled={isDisabled}
        aria-checked={notConfigured ? 'mixed' : value}
        ref={(node) => { if (node) node.indeterminate = notConfigured; }}
        style={{ accentColor: 'var(--accent-info)', cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.55 : 1 }}
        onChange={(event) => { if (!notConfigured) onChange(event.target.checked); }}
      />
    </EditableFieldShell>
  );
}
