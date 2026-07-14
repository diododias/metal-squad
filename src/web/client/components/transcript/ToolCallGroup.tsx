import React, { useState } from 'react';
import { ToolCallCard } from './ToolCallCard.js';
import type { ToolCallRecord } from '../../../../core/adapters/types.js';

export interface ToolCallGroupProps {
  groupKey: string;
  calls: ToolCallRecord[];
  defaultCollapsed?: boolean;
}

export function ToolCallGroup({ groupKey, calls, defaultCollapsed = false }: ToolCallGroupProps): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const failed = calls.some((call) => call.phase === 'failed');
  return (
    <section data-group-key={groupKey} style={{ marginLeft: 18, borderLeft: '2px solid var(--border-dim)', paddingLeft: 12 }}>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => { setCollapsed((value) => !value); }}
        style={{ border: 0, background: 'transparent', color: failed ? 'var(--accent-danger)' : 'var(--text-dim)', cursor: 'pointer', padding: '4px 0', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}
      >
        {collapsed ? '▸' : '▾'} {calls.length} tool call{calls.length === 1 ? '' : 's'}
      </button>
      {!collapsed && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {calls.map((call) => (
          <ToolCallCard
            key={call.id}
            tool={call.name}
            status={call.phase === 'started' ? 'running' : call.phase === 'failed' ? 'error' : 'done'}
            command={call.arguments == null ? undefined : JSON.stringify(call.arguments)}
            output={call.error ?? call.output ?? undefined}
          />
        ))}
      </div>}
    </section>
  );
}
