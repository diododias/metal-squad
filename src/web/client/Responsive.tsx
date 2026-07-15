import React, { useEffect, useState } from 'react';
import type { SidebarNavItem } from './components/navigation/Sidebar.js';

export function useIsMobile(breakpoint = 860): boolean {
  const query = `(max-width: ${String(breakpoint)}px)`;
  const forced = new URLSearchParams(window.location.search).get('mobile');
  const [isMobile, setIsMobile] = useState(() => (forced != null ? forced !== '0' : window.matchMedia(query).matches));

  useEffect(() => {
    if (forced != null) return undefined;
    const mq = window.matchMedia(query);
    const onChange = (): void => {
      setIsMobile(mq.matches);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return (): void => {
      mq.removeEventListener('change', onChange);
    };
  }, [query, forced]);

  return isMobile;
}

const MOBILE_NAV_ICONS: Record<string, string> = {
  '/board': '▤',
  '/runs': '≡',
  '/gates': '◔',
  '/analytics': '▲',
  '/config': '⚙',
};

export interface MobileTabBarProps {
  items: SidebarNavItem[];
  activePath: string;
  onNavigate: (path: string) => void;
}

export function MobileTabBar({ items, activePath, onNavigate }: MobileTabBarProps): React.JSX.Element {
  return (
    <nav
      style={{
        display: 'flex',
        flexShrink: 0,
        borderTop: '1px solid var(--border-dim)',
        background: 'var(--bg-panel)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
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
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '9px 4px 7px',
              color: active ? 'var(--accent-info)' : 'var(--text-dim)',
              textDecoration: 'none',
              position: 'relative',
              fontFamily: 'var(--font-mono)',
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{MOBILE_NAV_ICONS[item.path] ?? '•'}</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: active ? 600 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
            >
              {item.label}
            </span>
            {item.count != null && item.count > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 3,
                  right: '24%',
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
                }}
              >
                {item.count > 9 ? '9+' : item.count}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}

export interface MobileTopBarProps {
  live: boolean;
  notificationCount: number;
  onHelp: () => void;
  onNotifications: () => void;
  onLogout?: () => void;
}

const ICON_BTN_STYLE: React.CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-dim)',
  background: 'transparent',
  cursor: 'pointer',
  position: 'relative',
};

export function MobileTopBar({
  live,
  notificationCount,
  onHelp,
  onNotifications,
  onLogout,
}: MobileTopBarProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        flexShrink: 0,
        padding: '10px 14px',
        paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--border-dim)',
        background: 'var(--bg-panel)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, letterSpacing: '0.03em', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          <span style={{ color: 'var(--accent-info)' }}>&gt;</span> METAL SQUAD
        </span>
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
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={onNotifications} title="Notifications" style={ICON_BTN_STYLE}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
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
              }}
            >
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>
        <button onClick={onHelp} title="Help" style={ICON_BTN_STYLE}>
          ?
        </button>
        {onLogout && (
          <button onClick={onLogout} title="Log out" style={ICON_BTN_STYLE}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6" />
              <path d="M10.5 11.5 14 8l-3.5-3.5" />
              <path d="M14 8H6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
