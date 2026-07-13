import React, { useState } from 'react';

export type ToolCallStatus = 'running' | 'done' | 'error';

export interface ToolCallCardProps {
  tool: string;
  status?: ToolCallStatus;
  command?: string;
  output?: string;
  time?: string;
}

const STATUS_GLYPH: Record<ToolCallStatus, string> = { running: '⟳', done: '✓', error: '✗' };
const STATUS_COLOR: Record<ToolCallStatus, string> = {
  running: 'var(--accent-info)',
  done: 'var(--accent-ok)',
  error: 'var(--accent-danger)',
};

export function ToolCallCard({ tool, status = 'done', command, output, time }: ToolCallCardProps): React.JSX.Element {
  const [open, setOpen] = useState(status === 'running');
  const color = STATUS_COLOR[status];
  const lineCount = output ? output.split('\n').length : 0;

  return (
    <div
      style={{
        background: 'var(--bg-sunken)',
        border: `1px solid ${status === 'error' ? 'var(--accent-danger)' : 'var(--border-dim)'}`,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--bg-panel-alt)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--text-2xs)',
              fontWeight: 600,
              color,
              border: `1px solid ${color}`,
              borderRadius: 'var(--radius-sm)',
              padding: '2px 6px',
              flexShrink: 0,
              background: status === 'running' ? 'var(--accent-info-10)' : 'transparent',
              animation: status === 'running' ? 'msq-tc-pulse 1.4s ease-in-out infinite' : 'none',
            }}
          >
            {STATUS_GLYPH[status]} tool:{tool}
          </span>
          {command && (
            <code style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {command}
            </code>
          )}
        </div>
        {time && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', flexShrink: 0, marginLeft: 8 }}>{time}</span>}
      </div>
      {output && (
        <div>
          <div
            onClick={() => { setOpen((o) => !o); }}
            style={{ padding: '5px 10px', fontSize: 'var(--text-2xs)', color: 'var(--accent-info)', cursor: 'pointer', userSelect: 'none' }}
          >
            {open ? '▾ hide output' : `▸ show output (${String(lineCount)} line${lineCount === 1 ? '' : 's'})`}
          </div>
          {open && (
            <pre
              style={{
                margin: 0,
                padding: '8px 10px',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-dim)',
                maxHeight: 220,
                overflow: 'auto',
                borderTop: '1px solid var(--border-dim)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {output}
            </pre>
          )}
        </div>
      )}
      <style>{'@keyframes msq-tc-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }'}</style>
    </div>
  );
}
