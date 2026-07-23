import React from 'react';

export interface TrendPoint {
  id?: string | number;
  label: string;
  value: number;
  comparisonValue?: number;
}

export interface TrendBarsProps {
  points: TrendPoint[];
  valueFormatter?: (value: number) => string;
  color?: string;
}

export function TrendBars({ points, valueFormatter, color = 'var(--accent-info)' }: TrendBarsProps): React.JSX.Element {
  const max = Math.max(...points.flatMap((p) => [p.value, p.comparisonValue ?? 0]), 1);
  const fmt = valueFormatter ?? ((v: number): string => v.toLocaleString());

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
      {points.map((p, i) => (
        <div
          key={p.id ?? i}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}
        >
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-dim)' }}>{fmt(p.value)}</span>
          <div style={{ width: '100%', maxWidth: 34, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: '100%' }}>
            {p.comparisonValue !== undefined && <div title={`Previous period: ${fmt(p.comparisonValue)}`} style={{ width: '45%', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', background: 'var(--text-faint)', height: `${String(Math.max((p.comparisonValue / max) * 100, p.comparisonValue ? 3 : 0))}%`, transition: 'height 0.2s' }} />}
            <div
              style={{
                width: p.comparisonValue !== undefined ? '45%' : '100%',
                borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                background: color,
                height: `${String(Math.max((p.value / max) * 100, p.value ? 3 : 0))}%`,
                transition: 'height 0.2s',
              }}
            />
          </div>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{p.label}</span>
        </div>
      ))}
    </div>
  );
}
