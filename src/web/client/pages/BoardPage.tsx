import React, { useState } from 'react';
import { Card } from '../components/core/Card.js';
import { Tag } from '../components/core/Tag.js';
import { KanbanCard } from '../components/data/KanbanCard.js';
import { PageHeader } from '../PageHeader.js';
import type { MsqWebState } from '../../types.js';
import type { RunSummary } from '../../../db/repo.js';

const WORKFLOW_STAGES = ['specify', 'plan', 'tasks', 'implement', 'validate'];

export interface BoardPageProps {
  state: MsqWebState;
  isMobile: boolean;
  onOpenRun: (featureId: string) => void;
  onOpenBacklogItem: (featureId: string) => void;
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
  const [viewMode, setViewMode] = useState<'status' | 'workflow'>('status');

  const q = query.trim().toLowerCase();
  const matches = (title: string | null | undefined, id: string): boolean =>
    !q || (title ?? '').toLowerCase().includes(q) || id.toLowerCase().includes(q);
  const byTool = (r: RunSummary): boolean => toolFilter === 'all' || r.tool === toolFilter;

  const todo = state.pendingFeatures.filter((f) => matches(f.title, f.id) && (toolFilter === 'all' || f.tool === toolFilter));

  let columns: Column[];
  if (viewMode === 'status') {
    columns = [
      { key: 'progress', label: 'IN PROGRESS / BLOCKED', items: state.runs.filter((r) => (r.status === 'running' || r.status === 'blocked') && matches(r.featureId, r.featureId) && byTool(r)), empty: 'No active runs' },
      { key: 'done', label: 'DONE', items: state.runs.filter((r) => r.status === 'done' && matches(r.featureId, r.featureId) && byTool(r)), empty: 'No completed runs' },
      { key: 'failed', label: 'FALHA / CANCELED', items: state.runs.filter((r) => (r.status === 'failed' || r.status === 'aborted') && matches(r.featureId, r.featureId) && byTool(r)), empty: 'No failed runs' },
    ];
  } else {
    const active = state.runs.filter((r) => r.status !== 'done' && matches(r.featureId, r.featureId) && byTool(r));
    const done = state.runs.filter((r) => r.status === 'done' && matches(r.featureId, r.featureId) && byTool(r));
    columns = [
      ...WORKFLOW_STAGES.map((stage) => ({
        key: stage,
        label: stage.toUpperCase(),
        items: active.filter((r) => (r.stage ?? 'implement') === stage),
        empty: 'No runs at this stage',
      })),
      { key: 'done', label: 'DONE', items: done, empty: 'No completed runs' },
    ];
  }

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
            <div style={{ display: 'flex', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', marginLeft: 4 }}>
              {(['status', 'workflow'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => { setViewMode(opt); }}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    padding: '7px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    background: viewMode === opt ? 'var(--accent-info-10)' : 'transparent',
                    color: viewMode === opt ? 'var(--accent-info)' : 'var(--text-dim)',
                    fontWeight: viewMode === opt ? 600 : 400,
                  }}
                >
                  {opt === 'status' ? 'by status' : 'by workflow stage'}
                </button>
              ))}
            </div>
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
                <div key={f.id} onClick={() => { onOpenBacklogItem(f.id); }} style={{ cursor: 'pointer' }}>
                  <Card>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 4 }}>{f.id}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)', marginBottom: 6 }}>{f.title}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Tag>{f.tool}</Tag>
                      <Tag>{f.effort}</Tag>
                    </div>
                  </Card>
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
                  <div key={r.runId} onClick={() => { onOpenRun(r.featureId); }}>
                    <KanbanCard
                      run={{
                        featureId: r.featureId,
                        title: state.featureCatalog[r.featureId]?.title,
                        status: r.status,
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
