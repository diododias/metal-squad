import React from 'react';

export type ButtonVariant = 'primary' | 'ok' | 'neutral' | 'recovery' | 'destructive' | 'pause';

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  title?: string;
}

const VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: 'var(--accent-info)', borderColor: 'var(--accent-info)', color: 'var(--bg-base)' },
  ok: { background: 'var(--accent-ok)', borderColor: 'var(--accent-ok)', color: 'var(--bg-base)' },
  neutral: { background: 'transparent', borderColor: 'var(--border-strong)', color: 'var(--text-primary)' },
  recovery: { background: 'transparent', borderColor: 'var(--accent-warn)', color: 'var(--accent-warn)' },
  destructive: { background: 'var(--accent-danger)', borderColor: 'var(--accent-danger)', color: 'var(--bg-base)' },
  pause: { background: 'transparent', borderColor: 'var(--text-dim)', color: 'var(--text-dim)' },
};

export function Button({
  variant = 'neutral',
  size = 'md',
  disabled = false,
  onClick,
  children,
  style,
  title,
}: ButtonProps): React.JSX.Element {
  const base: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)',
    fontWeight: 600,
    padding: size === 'sm' ? '5px 10px' : '8px 14px',
    borderRadius: 'var(--radius-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    border: '1px solid transparent',
    transition: 'filter 0.1s, background 0.1s',
    lineHeight: 1.4,
  };

  return (
    <button
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={onClick}
      title={title}
      style={{ ...base, ...VARIANTS[variant], ...style }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.filter = 'brightness(1.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'none';
      }}
    >
      {children}
    </button>
  );
}
