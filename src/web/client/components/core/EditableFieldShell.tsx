import React from 'react';

export interface EditableFieldShellProps {
  label: string;
  controlId: string;
  isDirty: boolean;
  hint?: string;
  children: React.ReactNode;
}

/**
 * Presentation-only frame shared by controlled editing primitives.
 * Consumers retain the current value, its saved reference, and all persistence.
 */
export function EditableFieldShell({
  label,
  controlId,
  isDirty,
  hint,
  children,
}: EditableFieldShellProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <label htmlFor={controlId} style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
          {label}
        </label>
        {isDirty && (
          <span style={{ color: 'var(--accent-warn)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
            modified
          </span>
        )}
      </div>
      {children}
      {hint && <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)', lineHeight: 1.4 }}>{hint}</span>}
    </div>
  );
}
