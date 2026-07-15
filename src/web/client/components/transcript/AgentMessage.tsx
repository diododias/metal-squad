import React from 'react';

export interface AgentMessageProps {
  text: string;
  time?: string;
}

export function AgentMessage({ text, time }: AgentMessageProps): React.JSX.Element {
  return (
    <div style={{ fontFamily: 'var(--font-mono)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--accent-info)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
          agent
        </span>
        {time && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{time}</span>}
      </div>
      <div
        style={{
          borderLeft: '2px solid var(--accent-info)',
          paddingLeft: 10,
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
          lineHeight: 'var(--leading-normal)',
        }}
      >
        {text}
      </div>
    </div>
  );
}
