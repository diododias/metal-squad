import React, { useId } from 'react';
import { EditableFieldShell } from './EditableFieldShell.js';

export interface EditableSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface EditableSelectFieldProps {
  label: string;
  value: string | undefined;
  initialValue: string | undefined;
  options: readonly EditableSelectOption[];
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  id?: string;
  missingValueLabel?: string;
}

export function EditableSelectField({
  label,
  value,
  initialValue,
  options,
  onChange,
  disabled = false,
  id,
  missingValueLabel,
}: EditableSelectFieldProps): React.JSX.Element {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hasCurrentOption = value !== undefined && options.some((option) => option.value === value);
  const isUnavailableValue = value !== undefined && !hasCurrentOption;
  const isDisabled = disabled || options.length === 0;
  const noValueLabel = missingValueLabel ?? 'No value configured';

  return (
    <EditableFieldShell
      label={label}
      controlId={controlId}
      isDirty={value !== initialValue}
      hint={options.length === 0 ? noValueLabel : undefined}
    >
      <select
        id={controlId}
        value={value ?? ''}
        disabled={isDisabled}
        style={{
          width: '100%', background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', padding: '7px 9px',
          cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.55 : 1,
        }}
        onChange={(event) => { onChange(event.target.value || undefined); }}
      >
        {value === undefined && <option value="">{noValueLabel}</option>}
        {isUnavailableValue && <option value={value} disabled>{value} (unavailable)</option>}
        {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      </select>
    </EditableFieldShell>
  );
}
