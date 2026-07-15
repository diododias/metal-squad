import React from 'react';
import { Modal } from './components/feedback/Modal.js';

interface Shortcut {
  key: string;
  label: string;
}

interface ShortcutGroup {
  group: string;
  items: Shortcut[];
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    group: 'Navigation',
    items: [
      { key: 'g b', label: 'Go to Board' },
      { key: 'g r', label: 'Go to Runs' },
      { key: 'g g', label: 'Go to Gates' },
      { key: 'g a', label: 'Go to Analytics' },
      { key: 'g c', label: 'Go to Config' },
      { key: '?', label: 'Toggle this help overlay' },
    ],
  },
  {
    group: 'Run Detail',
    items: [
      { key: 'Tab', label: 'Cycle subtabs' },
      { key: 'Ctrl+S', label: 'Pause/resume output stream' },
      { key: 'Ctrl+L', label: 'Toggle logs' },
    ],
  },
];

export interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function HelpOverlay({ open, onClose }: HelpOverlayProps): React.JSX.Element {
  return (
    <Modal open={open} onClose={onClose} width={520}>
      <div style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: '26px', fontFamily: 'var(--font-display)', fontWeight: 400, letterSpacing: '0.02em' }}>
          Keyboard shortcuts
        </h2>
        {SHORTCUTS.map((g) => (
          <div key={g.group} style={{ marginBottom: 14 }}>
            <div
              style={{
                fontSize: 'var(--text-2xs)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                color: 'var(--text-faint)',
                marginBottom: 6,
              }}
            >
              {g.group}
            </div>
            {g.items.map((s) => (
              <div
                key={s.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '5px 0',
                  borderBottom: '1px solid var(--border-dim)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <span style={{ color: 'var(--accent-info)' }}>{s.key}</span>
                <span style={{ color: 'var(--text-dim)' }}>{s.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
