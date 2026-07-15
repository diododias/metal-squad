import React from 'react';

export interface TagProps {
  children?: React.ReactNode;
  tone?: 'default' | 'accent';
}

const TONES: Record<'default' | 'accent', { color: string; border: string }> = {
  default: { color: 'var(--text-dim)', border: 'var(--border-dim)' },
  accent: { color: 'var(--accent-info)', border: 'var(--accent-info)' },
};

export function Tag({ children, tone = 'default' }: TagProps): React.JSX.Element {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-2xs)',
        padding: '2px 7px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${t.border}`,
        color: t.color,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
