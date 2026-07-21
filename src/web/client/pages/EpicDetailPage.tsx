import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { Card } from '../components/core/Card.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { DependencyTag } from '../components/FeatureConfigDetail.js';
import { LifecycleActions } from '../components/LifecycleActions.js';
import { CreateWorkItemModal } from '../components/project/CreateWorkItemModal.js';
import { Modal } from '../components/feedback/Modal.js';
import { EpicEditor } from './EpicEditor.js';
import { WorkflowStepper } from '../components/navigation/WorkflowStepper.js';
import { ProgressBar } from '../components/data/ProgressBar.js';
import { startEligibility } from '../lib/startEligibility.js';
import { PageHeader } from '../PageHeader.js';
import type { ToastStackItem } from '../components/feedback/ToastStack.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

const PAGE_SIZE = 8;
let sequence = 0;
const nextRequestId = (prefix: string): string => `${prefix}-${String(Date.now())}-${String(++sequence)}`;

export function EpicDetailPage({ state, projectId, epicId, send, actionResults, onBack, onOpenBacklogItem, onToast, connected }: {
  state: MsqWebState;
  projectId: string;
  epicId: string;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
  onBack: () => void;
  onOpenBacklogItem: (featureId: string) => void;
  onToast?: (item: ToastStackItem) => void;
  connected?: boolean;
}): React.JSX.Element {
  const project = state.projects.find((item) => item.projectId === projectId);
  const epic = state.epics.find((item) => item.epicId === epicId && item.projectId === projectId && item.archivedAt === null);
  const [page, setPage] = useState(0);
  const [showCreateWorkItem, setShowCreateWorkItem] = useState(false);
  const [showEditEpic, setShowEditEpic] = useState(false);

  const items = useMemo(
    () => Object.values(state.featureCatalog).filter((item) => item.epicId === epicId),
    [epicId, state.featureCatalog],
  );
  const doneFeatureIds = useMemo(() => new Set(state.runs.filter((run) => run.status === 'done').map((run) => run.featureId)), [state.runs]);
  const failedFeatureIds = useMemo(() => new Set(state.runs.filter((run) => run.status === 'failed').map((run) => run.featureId)), [state.runs]);
  const [query, setQuery] = useState('');
  const [runStatusFilter, setRunStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [repoFilter, setRepoFilter] = useState('all');
  const [order, setOrder] = useState('backlog');

  const runStatusByItem = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((item) => { map.set(item.id, state.runs.find((run) => run.featureId === item.id)?.status ?? 'not_started'); });
    return map;
  }, [items, state.runs]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) =>
      (!q || item.title.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
      && (runStatusFilter === 'all' || runStatusByItem.get(item.id) === runStatusFilter)
      && (typeFilter === 'all' || item.workItemType === typeFilter)
      && (repoFilter === 'all' || (item.repoLabel ?? 'unresolved') === repoFilter));
    if (order === 'title') return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    if (order === 'status') {
      const rank: Record<string, number> = { running: 0, blocked: 1, failed: 2, done: 3, aborted: 4, not_started: 5 };
      return [...filtered].sort((a, b) => (rank[runStatusByItem.get(a.id) ?? 'not_started'] ?? 5) - (rank[runStatusByItem.get(b.id) ?? 'not_started'] ?? 5));
    }
    return filtered;
  }, [items, query, runStatusFilter, typeFilter, repoFilter, order, runStatusByItem]);

  useEffect(() => { setPage(0); }, [query, runStatusFilter, typeFilter, repoFilter, order]);

  if (!project || !epic) {
    return <div style={{ padding: 24 }}>
      <p>Epic not found or no longer active.</p>
      <Button onClick={onBack}>back to Project</Button>
    </div>;
  }

  const completed = items.filter((item) => doneFeatureIds.has(item.id)).length;
  const visible = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const repoCounts = new Map<string, number>();
  items.forEach((item) => repoCounts.set(item.repoLabel ?? 'unresolved', (repoCounts.get(item.repoLabel ?? 'unresolved') ?? 0) + 1));

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <PageHeader
      title={epic.title}
      breadcrumb={[
        { label: 'Projects', href: '/projects' },
        { label: project.name, href: `/projects/${projectId}` },
      ]}
      filters={<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); }}
          placeholder="Search Work Items…"
          aria-label="Search Work Items"
          style={searchStyle}
        />
        <select value={runStatusFilter} onChange={(event) => { setRunStatusFilter(event.target.value); }} aria-label="Run status" style={controlStyle}>
          <option value="all">all statuses</option>
          <option value="not_started">not started</option>
          <option value="running">running</option>
          <option value="blocked">blocked</option>
          <option value="done">done</option>
          <option value="failed">failed</option>
        </select>
        <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); }} aria-label="Work Item type filter" style={controlStyle}>
          <option value="all">all types</option>
          <option value="feature">feature</option>
          <option value="bug">bug</option>
        </select>
        <select value={repoFilter} onChange={(event) => { setRepoFilter(event.target.value); }} aria-label="Repository filter" style={controlStyle}>
          <option value="all">all repos</option>
          {[...repoCounts.keys()].map((label) => <option key={label} value={label}>{label}</option>)}
        </select>
        <select value={order} onChange={(event) => { setOrder(event.target.value); }} aria-label="Work Item order" style={controlStyle}>
          <option value="backlog">backlog order</option>
          <option value="status">by status</option>
          <option value="title">by title</option>
        </select>
      </div>}
      actions={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="primary" size="sm" onClick={() => { setShowCreateWorkItem(true); }}>+ Nova Feature</Button>
        <Button size="sm" onClick={() => { setShowEditEpic(true); }}>editar Épico</Button>
        <LifecycleActions
          kind="epic"
          id={epic.epicId}
          name={epic.title}
          revision={epic.revision}
          allowed={state.lifecycle?.[`epic:${epic.epicId}`]}
          send={send}
          actionResults={actionResults}
          onToast={onToast}
        />
      </div>}
    />
    <main style={{ overflow: 'auto', padding: 20, display: 'grid', gap: 16 }}>
      <Card>
        {epic.description && <p style={muted}>{epic.description}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 180 }}>
            <ProgressBar
              percent={items.length ? (completed / items.length) * 100 : 0}
              tone="ok"
              label={`derived progress: ${String(completed)}/${String(items.length)}`}
            />
          </div>
          <StatusPill status={epic.status === 'done' ? 'done' : epic.status === 'in_progress' ? 'running' : 'not_started'} label={`manual: ${epic.status}`} spinner={false} />
        </div>
        <div style={tags}>{[...repoCounts].map(([label, count]) => <Tag key={label}>{label}: {count}</Tag>)}</div>
      </Card>
      <section>
        <h2 style={heading}>Work Items</h2>
        {items.length === 0 && <Card><p style={muted}>No Work Items in this Epic yet.</p></Card>}
        {items.length > 0 && filteredItems.length === 0 && <Card><p style={muted}>No matching Work Items.</p></Card>}
        {visible.map((item) => {
          const run = state.runs.find((candidate) => candidate.featureId === item.id);
          const runActive = run?.status === 'running' || run?.status === 'blocked';
          const eligibility = startEligibility({
            dependsOn: item.dependsOn,
            repoId: item.repoId,
            integrityIssue: item.integrityIssue,
            doneFeatureIds,
            repositories: state.repositories,
          });
          const startItem = (): void => {
            send({ type: 'action:startFeature', featureId: item.id });
            onToast?.({
              id: `${String(Date.now())}-start-${item.id}`,
              tone: 'ok',
              message: `Start requested for "${item.title}".`,
              source: 'Work Items',
              action: { label: 'acompanhar run', onSelect: (): void => { window.location.hash = `/runs/${item.id}`; } },
            });
          };
          return <div
            key={item.id}
            role="link"
            tabIndex={0}
            aria-label={item.title}
            onClick={() => { onOpenBacklogItem(item.id); }}
            onKeyDown={(event) => { if (event.key === 'Enter') onOpenBacklogItem(item.id); }}
            style={rowStyle}
            onFocus={(event) => { event.currentTarget.style.outline = '1px solid var(--accent-info)'; }}
            onBlur={(event) => { event.currentTarget.style.outline = 'none'; }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <strong>{item.title}</strong>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={(event) => { event.stopPropagation(); }}
                onKeyDown={(event) => { event.stopPropagation(); }}
              >
                {runActive
                  ? <Button size="sm" onClick={() => { window.location.hash = `/runs/${item.id}`; }}>view run</Button>
                  : <Button size="sm" disabled={!eligibility.canStart} title={eligibility.reason ?? `Start "${item.title}"`} onClick={startItem}>start</Button>}
              </div>
            </div>
            <div style={tags}>
              <Tag>{item.workItemType}</Tag>
              <Tag>{item.repoLabel ?? 'unresolved repo'}</Tag>
              <StatusPill status={run?.status ?? 'not_started'} label={run?.status ?? 'not started'} spinner={run?.status === 'running'} />
              {item.dependsOn.map((dependency) => <DependencyTag key={dependency} depId={dependency} doneFeatureIds={doneFeatureIds} failedFeatureIds={failedFeatureIds} />)}
            </div>
            {item.workflow.stages.length > 0 && <div style={{ marginTop: 8 }}>
              <WorkflowStepper stages={item.workflow.stages} currentStage={null} allPending size="compact" />
            </div>}
            {item.integrityIssue && <p role="alert" style={{ color: 'var(--accent-warn)', margin: '8px 0 0' }}>{item.integrityIssue}</p>}
          </div>;
        })}
        {filteredItems.length > PAGE_SIZE && <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <Button size="sm" disabled={page === 0} onClick={() => { setPage(page - 1); }}>previous</Button>
          <Button size="sm" disabled={(page + 1) * PAGE_SIZE >= filteredItems.length} onClick={() => { setPage(page + 1); }}>next</Button>
        </div>}
      </section>
    </main>
    <CreateWorkItemModal
      open={showCreateWorkItem}
      projectId={projectId}
      defaultEpicId={epicId}
      state={state}
      send={send}
      actionResults={actionResults}
      onClose={() => { setShowCreateWorkItem(false); }}
      onCreated={(workItemId, title, createdEpicId) => {
        onToast?.({
          id: `${String(Date.now())}-work-item-created`,
          tone: 'ok',
          message: `Work Item "${title}" created (${workItemId}).`,
          source: 'Work Items',
          action: workItemId ? { label: 'abrir detalhe', onSelect: (): void => { window.location.hash = `/projects/${projectId}/epics/${createdEpicId}/items/${workItemId}`; } } : undefined,
        });
      }}
      connected={connected}
    />
    <Modal open={showEditEpic} onClose={() => { setShowEditEpic(false); }} width={640}>
      <div role="dialog" aria-label="Edit Epic" style={{ padding: 20, display: 'grid', gap: 12 }}>
        <EpicEditor
          epic={epic}
          completedWorkItems={completed}
          totalWorkItems={items.length}
          send={send}
          actionResults={actionResults}
          requestId={nextRequestId}
          onSaved={() => { onToast?.({ id: `${String(Date.now())}-epic-updated`, tone: 'ok', message: `Epic "${epic.title}" updated.`, source: 'Epics' }); }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="sm" onClick={() => { setShowEditEpic(false); }}>fechar</Button>
        </div>
      </div>
    </Modal>
  </div>;
}

const heading: React.CSSProperties = { margin: '0 0 10px', fontFamily: 'var(--font-display)', fontWeight: 400 };
const muted: React.CSSProperties = { color: 'var(--text-dim)', margin: '4px 0' };
const controlStyle: React.CSSProperties = {
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  padding: '7px 10px',
};
const searchStyle: React.CSSProperties = { ...controlStyle, flex: '1 1 160px', minWidth: 140 };
const tags: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 };
const rowStyle: React.CSSProperties = {
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-panel)',
  padding: 12,
  marginBottom: 10,
  cursor: 'pointer',
};
