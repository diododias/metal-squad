import React, { useCallback } from 'react';

export interface CardProps {
  children?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function Card({ children, selected = false, onClick, style }: CardProps): React.JSX.Element {
  const onMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selected) e.currentTarget.style.borderColor = 'var(--accent-info)';
    },
    [selected],
  );
  const onMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!selected) e.currentTarget.style.borderColor = 'var(--border-dim)';
    },
    [selected],
  );

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        background: 'var(--bg-sunken)',
        border: `1px solid ${selected ? 'var(--accent-info)' : 'var(--border-dim)'}`,
        outline: selected ? '1px solid var(--accent-info)' : 'none',
        borderRadius: 'var(--radius-sm)',
        padding: 'var(--space-3)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.1s',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
