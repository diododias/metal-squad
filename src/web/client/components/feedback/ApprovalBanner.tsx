import React from 'react';
import { Button } from '../core/Button.js';

export interface ApprovalBannerProps {
  prompt: string;
  onAdvance: () => void;
  onHold: () => void;
  onRetry: () => void;
}

export function ApprovalBanner({ prompt, onAdvance, onHold, onRetry }: ApprovalBannerProps): React.JSX.Element {
  return (
    <div
      style={{
        background: 'var(--accent-warn-10)',
        border: '1px solid var(--accent-warn)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div>
        <div
          style={{
            fontSize: 'var(--text-2xs)',
            color: 'var(--accent-warn)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)',
            marginBottom: 4,
          }}
        >
          Awaiting approval
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{prompt}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Button variant="primary" size="sm" onClick={onAdvance}>
          advance
        </Button>
        <Button variant="recovery" size="sm" onClick={onRetry}>
          retry
        </Button>
        <Button variant="neutral" size="sm" onClick={onHold}>
          hold
        </Button>
      </div>
    </div>
  );
}
