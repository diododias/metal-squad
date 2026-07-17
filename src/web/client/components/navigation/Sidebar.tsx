import React from 'react';

export interface SidebarNavItem {
  path: string;
  label: string;
  count?: number;
}

export interface SidebarProps {
  items: SidebarNavItem[];
  activePath: string;
  statusLine?: string;
  live?: boolean;
  notificationCount?: number;
  onNavigate: (path: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNotifications?: () => void;
  onLogout?: () => void;
}

export function Sidebar({
  items,
  activePath,
  statusLine,
  live,
  notificationCount = 0,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  onNotifications,
  onLogout,
}: SidebarProps): React.JSX.Element {
  return (
    <div
      style={{
        width: collapsed ? 48 : 'var(--sidebar-width)',
        minWidth: collapsed ? 48 : 'var(--sidebar-width)',
        height: '100%',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-dim)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div
        style={{
          padding: collapsed ? '16px 10px' : '16px',
          borderBottom: '1px solid var(--border-dim)',
          fontWeight: 400,
          fontFamily: 'var(--font-display)',
          fontSize: '28px',
          letterSpacing: '0.03em',
          color: 'var(--text-primary)',
          lineHeight: 1,
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{ border: 0, background: 'transparent', color: 'var(--accent-info)', cursor: 'pointer', font: 'inherit', padding: 0 }}
        >
          {collapsed ? '>' : '<'}
        </button>
        {!collapsed && ' METAL SQUAD'}
      </div>

      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => {
          const active = item.path === activePath;
          return (
            <a
              key={item.path}
              href={`#${item.path}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.path);
              }}
              style={{
                display: 'flex',
                justifyContent: collapsed ? 'center' : 'space-between',
                alignItems: 'center',
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                color: active ? 'var(--accent-info)' : 'var(--text-primary)',
                background: active ? 'var(--accent-info-10)' : 'transparent',
                fontSize: 'var(--text-sm)',
                fontWeight: active ? 600 : 400,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = 'var(--bg-panel-alt)';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span>{collapsed ? item.label.slice(0, 1) : item.label}</span>
              {!collapsed && item.count != null && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{item.count}</span>}
            </a>
          );
        })}
      </nav>

      <div
        style={{
          borderTop: '1px solid var(--border-dim)',
          padding: '10px 14px',
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-dim)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
          {!collapsed && <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0 }}>
          {live != null && (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flexShrink: 0,
                background: live ? 'var(--accent-ok)' : 'var(--text-faint)',
                boxShadow: live ? '0 0 0 2px var(--accent-ok-10)' : 'none',
              }}
            />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusLine ?? ''}</span>
          </span>}

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {onNotifications && (
            <a
              href="#notifications"
              onClick={(e) => {
                e.preventDefault();
                onNotifications();
              }}
              title="Notifications"
              style={{
                position: 'relative',
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-dim)',
                textDecoration: 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1 4.5 1 4.5H3s1-1.5 1-4.5Z" />
                <path d="M6.5 13a1.6 1.6 0 0 0 3 0" />
              </svg>
              {notificationCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -5,
                    minWidth: 14,
                    height: 14,
                    padding: '0 3px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--accent-danger)',
                    color: 'var(--bg-base)',
                    fontSize: 9,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {notificationCount > 9 ? '9+' : notificationCount}
                </span>
              )}
            </a>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              title="Log out"
              style={{
                width: 20,
                height: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-dim)',
                background: 'transparent',
                textDecoration: 'none',
                cursor: 'pointer',
                flexShrink: 0,
                padding: 0,
              }}
            >
              <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6" />
                <path d="M10.5 11.5 14 8l-3.5-3.5" />
                <path d="M14 8H6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
