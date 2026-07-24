import React from 'react';

export interface TableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

export interface TableProps<T extends { id?: string | number }> {
  columns: TableColumn<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  sort?: { key: string; direction: 'asc' | 'desc' };
  onSort?: (key: string) => void;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function Table<T extends { id?: string | number }>({ columns, rows, onRowClick, sort, onSort }: TableProps<T>): React.JSX.Element {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              aria-sort={col.sortable && sort?.key === col.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
              style={{
                textAlign: col.align ?? 'left',
                padding: '8px 10px',
                fontSize: 'var(--text-2xs)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                color: 'var(--text-dim)',
                borderBottom: '1px solid var(--border-dim)',
                fontWeight: 500,
              }}
            >
              {col.sortable && onSort ? <button type="button" onClick={() => { onSort(col.key); }} aria-label={`Sort by ${col.label}`} style={{ border: 0, padding: 0, background: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}>{col.label}{sort?.key === col.key ? ` ${sort.direction === 'asc' ? '↑' : '↓'}` : ''}</button> : col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.id ?? i}
            onClick={onRowClick ? (): void => { onRowClick(row); } : undefined}
            onKeyDown={onRowClick ? (event): void => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRowClick(row); } } : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            aria-label={onRowClick ? `Open ${String(row.id ?? i)}` : undefined}
            style={{
              cursor: onRowClick ? 'pointer' : 'default',
              background: i % 2 === 1 ? 'var(--bg-panel-alt)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-panel-alt)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = i % 2 === 1 ? 'var(--bg-panel-alt)' : 'transparent';
            }}
          >
            {columns.map((col) => (
              <td
                key={col.key}
                style={{
                  textAlign: col.align ?? 'left',
                  padding: '8px 10px',
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border-dim)',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.render ? col.render(row) : cellText((row as Record<string, unknown>)[col.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
