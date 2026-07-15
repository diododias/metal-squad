import React from 'react';

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function Tabs({ tabs, activeId, onSelect }: TabsProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--border-dim)', paddingBottom: 8 }}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            onClick={() => { onSelect(tab.id); }}
            style={{
              background: 'transparent',
              border: 'none',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              padding: '6px 8px',
              cursor: 'pointer',
              color: active ? 'var(--accent-info)' : 'var(--text-dim)',
              fontWeight: active ? 600 : 400,
              borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'var(--bg-panel-alt)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-dim)';
              }
            }}
          >
            {active ? `[${tab.label}]` : tab.label}
          </button>
        );
      })}
    </div>
  );
}
