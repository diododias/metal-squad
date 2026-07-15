import React from 'react';

export interface TrendPoint {
  id?: string | number;
  label: string;
  value: number;
}

export interface TrendBarsProps {
  points: TrendPoint[];
  valueFormatter?: (value: number) => string;
  color?: string;
}

export function TrendBars({ points, valueFormatter, color = 'var(--accent-info)' }: TrendBarsProps): React.JSX.Element {
  const max = Math.max(...points.map((p) => p.value), 1);
  const fmt = valueFormatter ?? ((v: number): string => v.toLocaleString());

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
      {points.map((p, i) => (
        <div
          key={p.id ?? i}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}
        >
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>{fmt(p.value)}</span>
          <div
            style={{
              width: '100%',
              maxWidth: 28,
              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
              background: color,
              height: `${String(Math.max((p.value / max) * 100, 3))}%`,
              transition: 'height 0.2s',
            }}
          />
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{p.label}</span>
        </div>
      ))}
    </div>
  );
}
