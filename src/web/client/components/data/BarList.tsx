import React from 'react';

export interface BarListItem {
  id?: string | number;
  label: string;
  value: number;
  color?: string;
}

export interface BarListProps {
  items: BarListItem[];
  valueFormatter?: (value: number) => string;
}

export function BarList({ items, valueFormatter }: BarListProps): React.JSX.Element {
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = valueFormatter ?? ((v: number): string => v.toLocaleString());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => (
        <div key={item.id ?? i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', marginBottom: 4, gap: 8 }}>
            <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{fmt(item.value)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 'var(--radius-pill)', background: 'var(--bg-panel-alt)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${String((item.value / max) * 100)}%`,
                background: item.color ?? 'var(--accent-info)',
                transition: 'width 0.2s',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
