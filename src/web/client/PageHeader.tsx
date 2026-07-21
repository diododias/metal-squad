import React from 'react';

export interface BreadcrumbItem {
  label: string;
  href: string;
}

export interface PageHeaderProps {
  title: string;
  breadcrumb?: React.ReactNode | BreadcrumbItem[];
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}

function isBreadcrumbTrail(breadcrumb: React.ReactNode | BreadcrumbItem[]): breadcrumb is BreadcrumbItem[] {
  return Array.isArray(breadcrumb) && breadcrumb.every((item) => typeof item === 'object' && item !== null && 'label' in item && 'href' in item);
}

const crumbLinkStyle: React.CSSProperties = { background: 'none', border: 0, color: 'var(--accent-info)', padding: 0, cursor: 'pointer', font: 'inherit' };

function BreadcrumbTrail({ items }: { items: BreadcrumbItem[] }): React.JSX.Element {
  return <span>
    {items.map((item, index) => <span key={item.href}>
      {index > 0 && <span style={{ color: 'var(--text-faint)' }}> › </span>}
      <button onClick={() => { window.location.hash = item.href; }} style={crumbLinkStyle}>{item.label}</button>
    </span>)}
  </span>;
}

export function PageHeader({ title, breadcrumb, actions, filters }: PageHeaderProps): React.JSX.Element {
  const breadcrumbNode = isBreadcrumbTrail(breadcrumb) ? <BreadcrumbTrail items={breadcrumb} /> : breadcrumb;
  return (
    <div className="msq-page-header" style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border-dim)', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          {breadcrumbNode && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', marginBottom: 4 }}>{breadcrumbNode}</div>}
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
