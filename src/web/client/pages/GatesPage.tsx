import React from 'react';
import { Button } from '../components/core/Button.js';
import { QuestionBanner } from '../components/feedback/QuestionBanner.js';
import { PageHeader } from '../PageHeader.js';
import type { MsqWebState, WebSocketClientMessage } from '../../types.js';
import { useActiveProject } from '../hooks/useActiveProject.js';
import { isInActiveProject } from '../lib/scope.js';

export interface GatesPageProps {
  state: MsqWebState;
  send: (message: WebSocketClientMessage) => void;
}

export function GatesPage({ state, send }: GatesPageProps): React.JSX.Element {
  const { activeProjectId } = useActiveProject();
  const gates = state.gates.filter((gate) => isInActiveProject(state, activeProjectId, gate));
  function resolve(gateId: number, kind: 'gate' | 'stage', response: 'advance' | 'hold' | 'retry'): void {
    if (kind === 'gate') {
      const decision = response === 'advance' ? 'approved' : response === 'retry' ? 'retried' : 'skipped';
      send({ type: 'action:resolveGate', gateId, decision });
    } else {
      send({ type: 'action:resolveStageRequest', requestId: gateId, response });
    }
  }

  function resolveQuestion(requestId: number, response: string): void {
    send({ type: 'action:resolveStageRequest', requestId, response });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader title="Gates" breadcrumb={`${String(gates.length)} awaiting decision`} />
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gates.length === 0 && <div style={{ color: 'var(--text-faint)', textAlign: 'center', padding: 40 }}>No pending gates</div>}
        {gates.map((g) => (
          <div key={`${g.kind}-${String(g.id)}`} style={{ background: 'var(--bg-panel)', border: '1px solid var(--accent-warn)', borderRadius: 'var(--radius-md)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <a href={`#/runs/${g.featureId}`} style={{ fontWeight: 600, color: 'var(--accent-info)', cursor: 'pointer', fontSize: 'var(--text-sm)', textDecoration: 'none' }}>
                    {g.featureId}
                  </a>
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>{g.kind}</span>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)' }}>
                  {g.requestKind !== 'input' && (g.prompt || 'Awaiting approval to advance.')}
                </div>
              </div>
              {g.requestKind !== 'input' && (
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <Button variant="primary" size="sm" onClick={() => { resolve(g.id, g.kind, 'advance'); }}>
                    advance
                  </Button>
                  <Button variant="recovery" size="sm" onClick={() => { resolve(g.id, g.kind, 'retry'); }}>
                    retry
                  </Button>
                  <Button variant="neutral" size="sm" onClick={() => { resolve(g.id, g.kind, 'hold'); }}>
                    hold
                  </Button>
                </div>
              )}
            </div>
            {g.requestKind === 'input' && (
              <div style={{ marginTop: 10 }}>
                <QuestionBanner prompt={g.prompt} options={g.options} onAnswer={(response) => { resolveQuestion(g.id, response); }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
