import React, { useId } from 'react';
import { EditableFieldShell } from './EditableFieldShell.js';

export interface EditableTextFieldProps {
  label: string;
  value: string | undefined;
  initialValue: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
  missingValueLabel?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  padding: '7px 9px',
  boxSizing: 'border-box',
};

export function EditableTextField({
  label,
  value,
  initialValue,
  onChange,
  disabled = false,
  id,
  placeholder,
  missingValueLabel,
}: EditableTextFieldProps): React.JSX.Element {
  const generatedId = useId();
  const controlId = id ?? generatedId;

  return (
    <EditableFieldShell
      label={label}
      controlId={controlId}
      isDirty={value !== initialValue}
      hint={value === undefined ? (missingValueLabel ?? 'No value configured') : undefined}
    >
      <input
        id={controlId}
        type="text"
        value={value ?? ''}
        disabled={disabled}
        placeholder={placeholder}
        style={{ ...inputStyle, cursor: disabled ? 'not-allowed' : 'text', opacity: disabled ? 0.55 : 1 }}
        onChange={(event) => { onChange(event.target.value); }}
      />
    </EditableFieldShell>
  );
}
