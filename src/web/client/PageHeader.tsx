import React from 'react';

export interface PageHeaderProps {
  title: string;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}

export function PageHeader({ title, breadcrumb, actions, filters }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="msq-page-header" style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border-dim)', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          {breadcrumb && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', marginBottom: 4 }}>{breadcrumb}</div>}
          <h1
            className="msq-page-header-title"
            style={{
              margin: 0,
              fontSize: 'clamp(22px, 5vw, 32px)',
              fontFamily: 'var(--font-display)',
              fontWeight: 400,
              letterSpacing: '0.02em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h1>
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      {filters && <div style={{ marginTop: 14 }}>{filters}</div>}
    </div>
  );
}
