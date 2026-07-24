import React, { useState } from 'react';
import { KanbanCard, type KanbanCardProps } from '../components/data/KanbanCard.js';
import { formatElapsed } from '../lib/format.js';
import { PageHeader } from '../PageHeader.js';
import type { MsqWebState } from '../../types.js';
import type { RunSummary } from '../../../db/repo.js';
import { useActiveProject } from '../hooks/useActiveProject.js';
import { scopedFeatures, scopedRuns } from '../lib/scope.js';
import { startEligibility } from '../lib/startEligibility.js';
import type { WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

export interface BoardPageProps {
  state: MsqWebState;
  isMobile: boolean;
  onOpenRun: (featureId: string) => void;
  onOpenBacklogItem: (featureId: string) => void;
  send?: (message: WebSocketClientMessage) => void;
  actionResults?: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
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

export function BoardPage({ state, isMobile, onOpenRun, onOpenBacklogItem, send, actionResults = {} }: BoardPageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [toolFilter, setToolFilter] = useState('all');
  const [epicFilter, setEpicFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const { activeProjectId } = useActiveProject();
  const projectFeatures = scopedFeatures(state, activeProjectId, Object.values(state.featureCatalog));
  const projectRuns = scopedRuns(state, activeProjectId);
  const projectRepoCount = new Set(projectFeatures.map((feature) => feature.repoId).filter(Boolean)).size;
  const repositories = 'repositories' in state ? state.repositories : [];
  const doneFeatureIds = new Set(state.doneFeatureIds);
  const lifecycleFor = (featureId: string, pipelineId: number | null | undefined): KanbanCardProps['lifecycle'] => {
    const feature = state.featureCatalog[featureId];
    if (!feature || !send) return undefined;
    return {
      allowed: state.lifecycle?.[`work_item:${feature.persistedId ?? featureId}`],
      revision: feature.revision,
      send,
      actionResults,
      eligibility: startEligibility({
        dependsOn: feature.dependsOn,
        repoId: feature.repoId,
        integrityIssue: feature.integrityIssue,
        doneFeatureIds,
        repositories,
      }),
      onStart: (): void => { send({ type: 'action:startFeature', featureId }); },
      onRequestCancel: pipelineId == null ? undefined : (): void => { send({ type: 'action:requestFeatureAbort', pipelineId, featureId }); },
    };
  };

  const q = query.trim().toLowerCase();
  const matches = (title: string | null | undefined, id: string): boolean =>
    !q || (title ?? '').toLowerCase().includes(q) || id.toLowerCase().includes(q);
  const byTool = (r: RunSummary): boolean => toolFilter === 'all' || r.tool === toolFilter;
  const matchesRun = (r: RunSummary): boolean =>
    matches(state.featureCatalog[r.featureId]?.title, r.featureId) && byTool(r) && (epicFilter === 'all' || state.featureCatalog[r.featureId]?.epicId === epicFilter) && (typeFilter === 'all' || state.featureCatalog[r.featureId]?.workItemType === typeFilter);

  const todo = scopedFeatures(state, activeProjectId, state.pendingFeatures).filter((f) => matches(f.title, f.id) && (toolFilter === 'all' || f.tool === toolFilter) && (epicFilter === 'all' || f.epicId === epicFilter) && (typeFilter === 'all' || f.workItemType === typeFilter));

  const columns: Column[] = [
    { key: 'progress', label: 'IN PROGRESS / BLOCKED', items: projectRuns.filter((r) => (r.status === 'running' || r.status === 'blocked') && matchesRun(r)), empty: 'No active runs' },
    { key: 'done', label: 'DONE', items: projectRuns.filter((r) => r.status === 'done' && matchesRun(r)), empty: 'No completed runs' },
    { key: 'failed', label: 'FALHA / CANCELED', items: projectRuns.filter((r) => (r.status === 'failed' || r.status === 'aborted') && matchesRun(r)), empty: 'No failed runs' },
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
              value={epicFilter}
              onChange={(e) => { setEpicFilter(e.target.value); }}
              style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '7px 10px' }}
            >
              <option value="all">all epics</option>
              {Array.from(projectFeatures.reduce((epics, feature) => { if (feature.epicId) epics.set(feature.epicId, feature.epicTitle ?? feature.epicId); return epics; }, new Map<string, string>()).entries()).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); }} style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', padding: '7px 10px' }}>
              <option value="all">all types</option><option value="feature">feature</option><option value="bug">bug</option>
            </select>
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
                      epicTitle: f.epicTitle,
                      status: 'todo',
                      stages: f.workflow.stages,
                      tool: f.tool,
                      model: f.model,
                      effort: f.effort,
                      autoAdvance: f.workflow.autoAdvance,
                      repoLabel: projectRepoCount > 1 ? f.repoLabel : null, workItemType: f.workItemType,
                      templateId: f.templateId, templateVersion: f.templateVersion,
                      repoUnhealthy: repositories.find((repo) => repo.repoId === f.repoId)?.health === 'unavailable',
                    }}
                    lifecycle={lifecycleFor(f.id, null)}
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
                        epicTitle: state.featureCatalog[r.featureId]?.epicTitle,
                        status: r.status,
                        pipelineStatus: r.pipelineStatus,
                        stages: state.featureCatalog[r.featureId]?.workflow.stages,
                        tool: r.tool,
                        model: state.featureCatalog[r.featureId]?.model,
                        effort: state.featureCatalog[r.featureId]?.effort,
                        autoAdvance: state.featureCatalog[r.featureId]?.workflow.autoAdvance,
                        stage: r.stage,
                        elapsed: formatElapsed(r.startedAt, r.endedAt),
                        tokens: r.totalTokens,
                        wasteTokens: r.wasteTokens,
                        prUrl: r.prUrl,
                        prNumber: r.prNumber,
                        pipelineId: r.pipelineId,
                        repoLabel: projectRepoCount > 1 ? state.featureCatalog[r.featureId]?.repoLabel : null,
                        workItemType: state.featureCatalog[r.featureId]?.workItemType,
                        templateId: state.featureCatalog[r.featureId]?.templateId,
                        templateVersion: state.featureCatalog[r.featureId]?.templateVersion,
                      }}
                      lifecycle={lifecycleFor(r.featureId, r.pipelineId)}
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
