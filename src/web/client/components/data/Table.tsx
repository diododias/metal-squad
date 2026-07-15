import React from 'react';

export interface TableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => React.ReactNode;
}

export interface TableProps<T extends { id?: string | number }> {
  columns: TableColumn<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function Table<T extends { id?: string | number }>({ columns, rows, onRowClick }: TableProps<T>): React.JSX.Element {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
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
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.id ?? i}
            onClick={onRowClick ? (): void => { onRowClick(row); } : undefined}
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
