import React from 'react';
import { ToolCallCard, type ToolCallStatus } from './ToolCallCard.js';
import { AgentMessage } from './AgentMessage.js';

export interface TranscriptEntry {
  id?: string | number;
  type: 'tool' | 'agent' | 'system';
  status?: ToolCallStatus;
  tool?: string;
  command?: string;
  output?: string;
  text?: string;
  time?: string;
}

export interface AgentTranscriptProps {
  entries: TranscriptEntry[];
}

const DOT_COLOR: Record<ToolCallStatus, string> = {
  running: 'var(--accent-info)',
  done: 'var(--accent-ok)',
  error: 'var(--accent-danger)',
};

export function AgentTranscript({ entries }: AgentTranscriptProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {entries.map((e, i) => (
        <div key={e.id ?? i} style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                marginTop: 6,
                flexShrink: 0,
                background: e.type === 'tool' ? DOT_COLOR[e.status ?? 'done'] : e.type === 'system' ? 'var(--text-faint)' : 'var(--accent-info)',
              }}
            />
            {i < entries.length - 1 && <div style={{ flex: 1, width: 1, background: 'var(--border-dim)', marginTop: 2 }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: 14 }}>
            {e.type === 'tool' && <ToolCallCard tool={e.tool ?? ''} status={e.status} command={e.command} output={e.output} time={e.time} />}
            {e.type === 'agent' && <AgentMessage text={e.text ?? ''} time={e.time} />}
            {e.type === 'system' && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                {e.text} <span style={{ marginLeft: 6 }}>{e.time}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
