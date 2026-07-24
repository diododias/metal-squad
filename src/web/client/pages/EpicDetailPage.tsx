import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { Card } from '../components/core/Card.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { DependencyTag } from '../components/FeatureConfigDetail.js';
import { LifecycleActions } from '../components/LifecycleActions.js';
import { WorkItemActions } from '../components/WorkItemActions.js';
import { CreateWorkItemModal } from '../components/project/CreateWorkItemModal.js';
import { Modal } from '../components/feedback/Modal.js';
import { EpicEditor } from './EpicEditor.js';
import { WorkflowStepper } from '../components/navigation/WorkflowStepper.js';
import { ProgressBar } from '../components/data/ProgressBar.js';
import { startEligibility } from '../lib/startEligibility.js';
import { hashWithRestoredQuery, readHashParams, updateHashParams } from '../lib/hashState.js';
import { pillStatus } from '../lib/pillStatus.js';
import { PageHeader } from '../PageHeader.js';
import type { ToastStackItem } from '../components/feedback/ToastStack.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

const PAGE_SIZE = 8;
let sequence = 0;
const nextRequestId = (prefix: string): string => `${prefix}-${String(Date.now())}-${String(++sequence)}`;

export function EpicDetailPage({ state, projectId, epicId, send, actionResults, archivedResults, onBack, onOpenBacklogItem, onToast, connected }: {
  state: MsqWebState;
  projectId: string;
  epicId: string;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
  archivedResults?: Record<string, Extract<WebSocketServerMessage, { type: 'action:archivedResult' }>>;
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
  const [initialParams] = useState((): URLSearchParams => readHashParams());
  const [query, setQuery] = useState(() => initialParams.get('q') ?? '');
  const [runStatusFilter, setRunStatusFilter] = useState(() => {
    const status = initialParams.get('status');
    return status && ['not_started', 'running', 'blocked', 'done', 'failed'].includes(status) ? status : 'all';
  });
  const [typeFilter, setTypeFilter] = useState(() => {
    const type = initialParams.get('type');
    return type && ['feature', 'bug'].includes(type) ? type : 'all';
  });
  const [repoFilter, setRepoFilter] = useState(() => initialParams.get('repo') ?? 'all');
  const [order, setOrder] = useState(() => {
    const value = initialParams.get('order');
    return value && ['status', 'title', 'recent'].includes(value) ? value : 'backlog';
  });

  useEffect(() => {
    updateHashParams({
      status: runStatusFilter === 'all' ? null : runStatusFilter,
      type: typeFilter === 'all' ? null : typeFilter,
      repo: repoFilter === 'all' ? null : repoFilter,
      order: order === 'backlog' ? null : order === 'recent' ? 'recent' : order,
    });
  }, [runStatusFilter, typeFilter, repoFilter, order]);
  useEffect(() => {
    const timer = setTimeout(() => { updateHashParams({ q: query.trim() || null }); }, 250);
    return (): void => { clearTimeout(timer); };
  }, [query]);

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
    if (order === 'recent') return [...filtered].sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
    if (order === 'status') {
      const rank: Record<string, number> = { running: 0, blocked: 1, failed: 2, done: 3, aborted: 4, not_started: 5 };
      return [...filtered].sort((a, b) => (rank[runStatusByItem.get(a.id) ?? 'not_started'] ?? 5) - (rank[runStatusByItem.get(b.id) ?? 'not_started'] ?? 5));
    }
    return filtered;
  }, [items, query, runStatusFilter, typeFilter, repoFilter, order, runStatusByItem]);

  useEffect(() => { setPage(0); }, [query, runStatusFilter, typeFilter, repoFilter, order]);

  const [showArchived, setShowArchived] = useState(false);
  const [archivedRequestId, setArchivedRequestId] = useState<string | null>(null);
  useEffect(() => {
    if (!showArchived || !epic) return;
    const requestId = nextRequestId('epic-archived-items');
    setArchivedRequestId(requestId);
    send({ type: 'action:queryArchived', requestId, filters: { epicId, kind: 'work_item' }, limit: 50, offset: 0 });
  }, [showArchived, epicId, epic, items.length, send]);
  const archivedResult = archivedRequestId ? archivedResults?.[archivedRequestId] : undefined;
  const archivedItems = (archivedResult?.payload.ok ? archivedResult.payload.items : [])
    .filter((entry) => !items.some((active) => active.id === entry.id));
  const archivedError = archivedResult && !archivedResult.payload.ok ? archivedResult.payload.error.message : null;

  const epicMissing = Boolean(project) && !epic;
  const [probeRequestId, setProbeRequestId] = useState<string | null>(null);
  useEffect(() => {
    if (!epicMissing) return;
    const requestId = nextRequestId('epic-archived-probe');
    setProbeRequestId(requestId);
    send({ type: 'action:queryArchived', requestId, filters: { projectId, kind: 'epic' }, limit: 50, offset: 0 });
  }, [epicMissing, projectId, send]);
  const probeResult = probeRequestId ? archivedResults?.[probeRequestId] : undefined;
  const archivedEpicEntry = (probeResult?.payload.ok ? probeResult.payload.items : []).find((entry) => entry.id === epicId);

  if (!project || !epic) {
    if (project && archivedEpicEntry) {
      return <div style={{ padding: 24, display: 'grid', gap: 12, justifyItems: 'start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: 'var(--text-faint)' }}>{archivedEpicEntry.title}</h2>
          <Tag>archived</Tag>
        </div>
        <p style={muted}>Epic archived {new Date(archivedEpicEntry.archivedAt).toLocaleString()}. Restore it to keep working, or go back to the project.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LifecycleActions kind="epic" id={archivedEpicEntry.id} name={archivedEpicEntry.title} revision={archivedEpicEntry.revision} allowed={archivedEpicEntry.allowed} send={send} actionResults={actionResults} onToast={onToast} />
          <Button onClick={onBack}>back to Project</Button>
        </div>
      </div>;
    }
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
        { label: project.name, href: hashWithRestoredQuery(`/projects/${projectId}`) },
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
          <option value="recent">mais recente</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); }} aria-label="Show archived Work Items" />
          show archived
        </label>
      </div>}
      actions={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="primary" size="sm" onClick={() => { setShowCreateWorkItem(true); }}>+ New Feature</Button>
        <Button size="sm" onClick={() => { setShowEditEpic(true); }}>Edit Epic</Button>
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
          <StatusPill status={pillStatus({ status: epic.status })} label={`manual: ${epic.status}`} spinner={false} />
        </div>
        <div style={tags}>{[...repoCounts].map(([label, count]) => <Tag key={label}>{label}: {count}</Tag>)}</div>
      </Card>
      <section>
        <h2 style={heading}>Work Items</h2>
        {items.length === 0 && <Card><p style={muted}>No Work Items in this Epic yet.</p></Card>}
        {items.length > 0 && filteredItems.length === 0 && <Card><p style={muted}>No matching Work Items.</p></Card>}
        {visible.map((item) => {
          const run = state.runs.find((candidate) => candidate.featureId === item.id);
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
              <div onClick={(event) => { event.stopPropagation(); }} onKeyDown={(event) => { event.stopPropagation(); }}>
                <WorkItemActions
                  id={item.persistedId ?? item.id}
                  name={item.title}
                  revision={item.revision}
                  allowed={state.lifecycle?.[`work_item:${item.persistedId ?? item.id}`]}
                  eligibility={eligibility}
                  pill={pillStatus(run ?? {})}
                  pipelineId={run?.pipelineId}
                  send={send}
                  actionResults={actionResults}
                  onStart={startItem}
                  startLabel="start"
                  onToast={onToast}
                />
              </div>
            </div>
            <div style={tags}>
              <Tag>{item.workItemType}</Tag>
              <Tag>{item.repoLabel ?? 'unresolved repo'}</Tag>
              <StatusPill status={pillStatus(run ?? {})} label={pillStatus(run ?? {})} />
              {item.dependsOn.map((dependency) => <DependencyTag key={dependency} depId={dependency} doneFeatureIds={doneFeatureIds} failedFeatureIds={failedFeatureIds} />)}
              {item.updatedAt && <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>updated {new Date(item.updatedAt).toLocaleDateString()}</span>}
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
        {showArchived && <div style={{ marginTop: 12 }}>
          {archivedError && <p role="alert" style={{ color: 'var(--accent-warn)', margin: '4px 0' }}>{archivedError}</p>}
          {!archivedError && archivedItems.length === 0 && <p style={{ color: 'var(--text-faint)', margin: '4px 0' }}>No archived Work Items in this Epic.</p>}
          {archivedItems.map((entry) => <div key={entry.id} aria-label={`${entry.title} (archived)`} style={archivedRowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--text-faint)' }}>{entry.title}</strong>
              <Tag>archived</Tag>
              {entry.workItemType && <Tag>{entry.workItemType}</Tag>}
              {entry.repoLabel && <Tag>{entry.repoLabel}</Tag>}
              <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>archived {new Date(entry.archivedAt).toLocaleString()}</span>
            </div>
            <LifecycleActions kind="work_item" id={entry.id} name={entry.title} revision={entry.revision} allowed={entry.allowed} send={send} actionResults={actionResults} onToast={onToast} />
          </div>)}
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
const archivedRowStyle: React.CSSProperties = {
  border: '1px dashed var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  background: 'transparent',
  padding: 12,
  marginBottom: 10,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
};
const tags: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 };
const rowStyle: React.CSSProperties = {
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-panel)',
  padding: 12,
  marginBottom: 10,
  cursor: 'pointer',
};
