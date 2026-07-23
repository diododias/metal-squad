import React from 'react';

export interface BarListItem {
  id?: string | number;
  label: React.ReactNode;
  value: number;
  color?: string;
  onClick?: () => void;
  ariaLabel?: string;
  segments?: { value: number; color: string; label: string }[];
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
            {item.onClick ? <button type="button" aria-label={item.ariaLabel} onClick={item.onClick} style={{ color: 'var(--text-primary)', overflow: 'hidden', minWidth: 0, padding: 0, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }}>{item.label}</button> : <div style={{ color: 'var(--text-primary)', overflow: 'hidden', minWidth: 0 }}>{item.label}</div>}
            <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{fmt(item.value)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 'var(--radius-pill)', background: 'var(--bg-panel-alt)', overflow: 'hidden', display: 'flex', width: `${String((item.value / max) * 100)}%`, transition: 'width 0.2s' }}>
            {item.segments?.length
              ? item.segments.map((segment) => <span key={segment.label} title={segment.label} style={{ width: `${String(item.value ? (segment.value / item.value) * 100 : 0)}%`, background: segment.color }} />)
              : <span style={{ width: '100%', background: item.color ?? 'var(--accent-info)' }} />}
          </div>
        </div>
      ))}
    </div>
  );
}
