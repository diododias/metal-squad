import React, { useState } from 'react';
import { Button } from '../core/Button.js';

export interface ApprovalBannerProps {
  prompt: string;
  onAdvance: () => void;
  onAdvanceWithTool: (tool: string) => void;
  onHold: () => void;
  onRetry: () => void;
}

const APPROVAL_TOOLS = ['claude', 'codex', 'opencode'] as const;

export function ApprovalBanner({ prompt, onAdvance, onAdvanceWithTool, onHold, onRetry }: ApprovalBannerProps): React.JSX.Element {
  const [selectedTool, setSelectedTool] = useState('');

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label htmlFor="approval-tool-override" style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>
            continue with tool
          </label>
          <select
            id="approval-tool-override"
            aria-label="Approval tool override"
            value={selectedTool}
            onChange={(event) => { setSelectedTool(event.target.value); }}
            style={{
              background: 'var(--bg-sunken)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              padding: '5px 8px',
            }}
          >
            <option value="">select tool</option>
            {APPROVAL_TOOLS.map((tool) => (
              <option key={tool} value={tool}>{tool}</option>
            ))}
          </select>
          <Button
            variant="ok"
            size="sm"
            disabled={!selectedTool}
            onClick={() => {
              if (selectedTool) onAdvanceWithTool(selectedTool);
            }}
          >
            approve + continue
          </Button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
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
    </div>
  );
}
