import React, { useState } from 'react';
import { KanbanCard } from '../components/data/KanbanCard.js';
import { PageHeader } from '../PageHeader.js';
import type { MsqWebState } from '../../types.js';
import type { RunSummary } from '../../../db/repo.js';

export interface BoardPageProps {
  state: MsqWebState;
  isMobile: boolean;
  onOpenRun: (featureId: string) => void;
  onOpenBacklogItem: (featureId: string) => void;
}

function cardInteraction(
  onActivate: () => void,
): Pick<React.HTMLAttributes<HTMLDivElement>, 'role' | 'tabIndex' | 'onClick' | 'onKeyDown'> {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

interface Column {
  key: string;
  label: string;
  items: RunSummary[];
  empty: string;
}

export function BoardPage({ state, isMobile, onOpenRun, onOpenBacklogItem }: BoardPageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [toolFilter, setToolFilter] = useState('all');

  const q = query.trim().toLowerCase();
  const matches = (title: string | null | undefined, id: string): boolean =>
    !q || (title ?? '').toLowerCase().includes(q) || id.toLowerCase().includes(q);
  const byTool = (r: RunSummary): boolean => toolFilter === 'all' || r.tool === toolFilter;
  const matchesRun = (r: RunSummary): boolean =>
    matches(state.featureCatalog[r.featureId]?.title, r.featureId) && byTool(r);

  const todo = state.pendingFeatures.filter((f) => matches(f.title, f.id) && (toolFilter === 'all' || f.tool === toolFilter));

  const columns: Column[] = [
    { key: 'progress', label: 'IN PROGRESS / BLOCKED', items: state.runs.filter((r) => (r.status === 'running' || r.status === 'blocked') && matchesRun(r)), empty: 'No active runs' },
    { key: 'done', label: 'DONE', items: state.runs.filter((r) => r.status === 'done' && matchesRun(r)), empty: 'No completed runs' },
    { key: 'failed', label: 'FALHA / CANCELED', items: state.runs.filter((r) => (r.status === 'failed' || r.status === 'aborted') && matchesRun(r)), empty: 'No failed runs' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="Board"
        filters={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              placeholder="Search features…"
              style={{
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-dim)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                padding: '7px 10px',
                flex: '1 1 160px',
                minWidth: 140,
              }}
            />
            <select
              value={toolFilter}
              onChange={(e) => { setToolFilter(e.target.value); }}
              style={{
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-dim)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                padding: '7px 10px',
              }}
            >
              <option value="all">all tools</option>
              <option value="claude">claude</option>
              <option value="codex">codex</option>
              <option value="opencode">opencode</option>
            </select>
          </div>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 12 : 20 }}>
        <div
          style={
            isMobile
              ? { display: 'flex', gap: 12, minHeight: '100%', overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }
              : { display: 'grid', gridTemplateColumns: `repeat(${String(columns.length + 1)}, minmax(220px, 1fr))`, gap: 12, minHeight: '100%' }
          }
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-dim)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              ...(isMobile ? { flex: '0 0 88vw', scrollSnapAlign: 'start' } : {}),
            }}
          >
            <h2
              style={{
                margin: 0,
                padding: '10px 12px',
                fontSize: 'var(--text-2xs)',
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                color: 'var(--text-dim)',
                borderBottom: '1px solid var(--border-dim)',
              }}
            >
              TODO ({todo.length})
            </h2>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todo.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', textAlign: 'center', padding: 20 }}>No pending features</div>}
              {todo.map((f) => (
                <div key={f.id} {...cardInteraction(() => { onOpenBacklogItem(f.id); })} style={{ cursor: 'pointer' }}>
                  <KanbanCard
                    run={{
                      featureId: f.id,
                      persistedId: f.persistedId,
                      title: f.title,
                      status: 'todo',
                      stages: f.workflow.stages,
                      tool: f.tool,
                      model: f.model,
                      effort: f.effort,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {columns.map((col) => (
            <div
              key={col.key}
              style={{
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-dim)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                ...(isMobile ? { flex: '0 0 88vw', scrollSnapAlign: 'start' } : {}),
              }}
            >
              <h2
                style={{
                  margin: 0,
                  padding: '10px 12px',
                  fontSize: 'var(--text-2xs)',
                  textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-wide)',
                  color: 'var(--text-dim)',
                  borderBottom: '1px solid var(--border-dim)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label} ({col.items.length})
              </h2>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.items.length === 0 && <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', textAlign: 'center', padding: 20 }}>{col.empty}</div>}
                {col.items.map((r) => (
                  <div key={r.runId} {...cardInteraction(() => { onOpenRun(r.featureId); })} style={{ cursor: 'pointer' }}>
                    <KanbanCard
                      run={{
                        featureId: r.featureId,
                        persistedId: state.featureCatalog[r.featureId]?.persistedId,
                        title: state.featureCatalog[r.featureId]?.title,
                        status: r.status,
                        stages: state.featureCatalog[r.featureId]?.workflow.stages,
                        tool: r.tool,
                        stage: r.stage,
                        tokens: r.totalTokens,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
