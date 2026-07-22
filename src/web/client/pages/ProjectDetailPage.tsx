import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { Card } from '../components/core/Card.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { LifecycleActions } from '../components/LifecycleActions.js';
import { CreateEpicModal } from '../components/project/CreateEpicModal.js';
import { CreateWorkItemModal } from '../components/project/CreateWorkItemModal.js';
import { EditProjectModal } from '../components/project/EditProjectModal.js';
import { RepositoriesSection } from '../components/project/RepositoriesSection.js';
import { WorkflowTemplatesSection } from '../components/WorkflowTemplatesSection.js';
import { Tabs } from '../components/navigation/Tabs.js';
import { readHashParams, updateHashParams } from '../lib/hashState.js';
import { PageHeader } from '../PageHeader.js';
import type { EpicRow as EpicRowData } from '../../../db/repo.js';
import type { ToastStackItem } from '../components/feedback/ToastStack.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

const PAGE_SIZE = 8;

let archivedSequence = 0;
const nextArchivedRequestId = (prefix: string): string => `${prefix}-${String(Date.now())}-${String(++archivedSequence)}`;

export function ProjectDetailPage({ state, projectId, send, actionResults, archivedResults, onBack, onToast, connected }: {
  state: MsqWebState; projectId: string; send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>; onBack: () => void;
  archivedResults?: Record<string, Extract<WebSocketServerMessage, { type: 'action:archivedResult' }>>;
  onToast?: (item: ToastStackItem) => void;
  connected?: boolean;
}): React.JSX.Element {
  const project = state.projects.find((item) => item.projectId === projectId);
  const repos = state.repositories.filter((repo) => repo.projectId === projectId);
  const epics = state.epics.filter((epic) => epic.projectId === projectId && epic.archivedAt === null);
  const [page, setPage] = useState(0);
  const [showCreateEpic, setShowCreateEpic] = useState(false);
  const [showCreateWorkItem, setShowCreateWorkItem] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [initialParams] = useState((): URLSearchParams => readHashParams());
  const [query, setQuery] = useState(() => initialParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = initialParams.get('status');
    return status && ['todo', 'in_progress', 'done'].includes(status) ? status : 'all';
  });
  const [order, setOrder] = useState(() => {
    const v = initialParams.get('order');
    return v === 'progress' ? 'progress' : v === 'recent' ? 'recent' : 'position';
  });

  useEffect(() => {
    updateHashParams({ status: statusFilter === 'all' ? null : statusFilter, order: order === 'position' ? null : order === 'recent' ? 'recent' : order });
  }, [statusFilter, order]);
  useEffect(() => {
    const timer = setTimeout(() => { updateHashParams({ q: query.trim() || null }); }, 250);
    return (): void => { clearTimeout(timer); };
  }, [query]);

  const progressByEpic = useMemo(() => {
    const map = new Map<string, { completed: number; total: number }>();
    epics.forEach((epic) => {
      const items = Object.values(state.featureCatalog).filter((item) => item.epicId === epic.epicId);
      const completed = items.filter((item) => state.runs.some((run) => run.featureId === item.id && run.status === 'done')).length;
      map.set(epic.epicId, { completed, total: items.length });
    });
    return map;
  }, [epics, state.featureCatalog, state.runs]);

  const filteredEpics = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = epics.filter((epic) =>
      (!q || epic.title.toLowerCase().includes(q)) && (statusFilter === 'all' || epic.status === statusFilter));
    const fraction = (epicId: string): number => {
      const progress = progressByEpic.get(epicId);
      return progress && progress.total > 0 ? progress.completed / progress.total : 0;
    };
    if (order === 'progress') return [...filtered].sort((a, b) => fraction(b.epicId) - fraction(a.epicId) || a.position - b.position);
    if (order === 'recent') return [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return [...filtered].sort((a, b) => a.position - b.position);
  }, [epics, query, statusFilter, order, progressByEpic]);

  useEffect(() => { setPage(0); }, [query, statusFilter, order]);

  const [activeTab, setActiveTab] = useState<string>(() => (initialParams.get('tab') === 'templates' ? 'templates' : 'epics'));
  const selectTab = (id: string): void => {
    setActiveTab(id);
    updateHashParams({ tab: id === 'templates' ? 'templates' : null });
  };

  const [showArchived, setShowArchived] = useState(false);
  const [archivedRequestId, setArchivedRequestId] = useState<string | null>(null);
  useEffect(() => {
    if (!showArchived) return;
    const requestId = nextArchivedRequestId('project-archived-epics');
    setArchivedRequestId(requestId);
    send({ type: 'action:queryArchived', requestId, filters: { projectId, kind: 'epic' }, limit: 50, offset: 0 });
  }, [showArchived, projectId, epics.length, send]);
  const archivedResult = archivedRequestId ? archivedResults?.[archivedRequestId] : undefined;
  const archivedEpics = (archivedResult?.payload.ok ? archivedResult.payload.items : [])
    .filter((entry) => !epics.some((active) => active.epicId === entry.id));
  const archivedError = archivedResult && !archivedResult.payload.ok ? archivedResult.payload.error.message : null;

  if (!project) return <div style={{ padding: 24 }}><p>Project not found or no longer active.</p><Button onClick={onBack}>back to Projects</Button></div>;

  const visible = filteredEpics.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <PageHeader
      title={project.name}
      description={project.description ?? undefined}
      breadcrumb={[{ label: 'Projects', href: '/projects' }]}
      filters={activeTab === 'epics' && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); }}
          placeholder="Search Epics…"
          aria-label="Search Epics"
          style={searchStyle}
        />
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); }} aria-label="Epic status" style={controlStyle}>
          <option value="all">all statuses</option>
          <option value="todo">todo</option>
          <option value="in_progress">in progress</option>
          <option value="done">done</option>
        </select>
        <select value={order} onChange={(event) => { setOrder(event.target.value); }} aria-label="Epic order" style={controlStyle}>
          <option value="position">by position</option>
          <option value="progress">by progress</option>
          <option value="recent">mais recente</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); }} aria-label="Show archived Epics" />
          show archived
        </label>
      </div>}
      actions={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="primary" size="sm" onClick={() => { setShowCreateEpic(true); }}>+ New Epic</Button>
        <Button size="sm" onClick={() => { setShowCreateWorkItem(true); }}>+ New Feature</Button>
        <Button size="sm" onClick={() => { setShowEditProject(true); }}>Edit Project</Button>
        <LifecycleActions
          kind="project"
          id={project.projectId}
          name={project.name}
          revision={project.revision}
          allowed={state.lifecycle?.[`project:${project.projectId}`]}
          send={send}
          actionResults={actionResults}
          onToast={onToast}
        />
      </div>}
    />
    <main style={{ overflow: 'auto', padding: 20, display: 'grid', gap: 16 }}>
      <Tabs
        tabs={[{ id: 'epics', label: 'Epics' }, { id: 'templates', label: 'Templates' }]}
        activeId={activeTab}
        onSelect={selectTab}
      />
      {activeTab === 'epics' && <><Card>
        <div style={tags}>
          <Tag>{repos.length} repos</Tag>
          <Tag>{project.counts.epics} Epics</Tag>
          <Tag>{project.counts.workItems} Work Items</Tag>
          <StatusPill status={project.activeRuns ? 'running' : 'not_started'} label={`${String(project.activeRuns)} active runs`} spinner={false} />
        </div>
      </Card>
      <Card><RepositoriesSection project={project} repositories={state.repositories} actionResults={actionResults} send={send} /></Card>
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ ...heading, marginBottom: 0 }}>Epics</h2>
          <Button variant="primary" size="sm" onClick={() => { setShowCreateEpic(true); }}>+ New Epic</Button>
        </div>
        {epics.length === 0 && <Card>
          <p style={muted}>No Epics yet.</p>
        </Card>}
        {epics.length > 0 && filteredEpics.length === 0 && <Card><p style={muted}>No matching Epics.</p></Card>}
        {visible.map((epic) => <EpicRow key={epic.epicId} epic={epic} state={state} projectId={projectId} />)}
        {filteredEpics.length > PAGE_SIZE && <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <Button size="sm" disabled={page === 0} onClick={() => { setPage(page - 1); }}>previous</Button>
          <Button size="sm" disabled={(page + 1) * PAGE_SIZE >= filteredEpics.length} onClick={() => { setPage(page + 1); }}>next</Button>
        </div>}
        {showArchived && <div style={{ marginTop: 12 }}>
          {archivedError && <p role="alert" style={{ color: 'var(--accent-warn)', margin: '4px 0' }}>{archivedError}</p>}
          {!archivedError && archivedEpics.length === 0 && <p style={{ color: 'var(--text-faint)', margin: '4px 0' }}>No archived Epics in this project.</p>}
          {archivedEpics.map((entry) => <div key={entry.id} aria-label={`${entry.title} (archived)`} style={archivedRowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--text-faint)' }}>{entry.title}</strong>
              <Tag>archived</Tag>
              <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>archived {new Date(entry.archivedAt).toLocaleString()}</span>
            </div>
            <LifecycleActions kind="epic" id={entry.id} name={entry.title} revision={entry.revision} allowed={entry.allowed} send={send} actionResults={actionResults} onToast={onToast} />
          </div>)}
        </div>}
      </section></>}
      {activeTab === 'templates' && <section><h2 style={heading}>Workflow Templates</h2><WorkflowTemplatesSection state={state} projectId={projectId} send={send} actionResults={actionResults} /></section>}
    </main>
    <CreateEpicModal
      open={showCreateEpic}
      projectId={projectId}
      send={send}
      actionResults={actionResults}
      onClose={() => { setShowCreateEpic(false); }}
      onCreated={(title) => { onToast?.({ id: `${String(Date.now())}-epic-created`, tone: 'ok', message: `Epic "${title}" created.`, source: 'Epics' }); }}
      connected={connected}
    />
    <CreateWorkItemModal
      open={showCreateWorkItem}
      projectId={projectId}
      state={state}
      send={send}
      actionResults={actionResults}
      onClose={() => { setShowCreateWorkItem(false); }}
      onCreated={(workItemId, title, epicId) => {
        onToast?.({
          id: `${String(Date.now())}-work-item-created`,
          tone: 'ok',
          message: `Work Item "${title}" created (${workItemId}).`,
          source: 'Work Items',
          action: workItemId ? { label: 'abrir detalhe', onSelect: (): void => { window.location.hash = `/projects/${projectId}/epics/${epicId}/items/${workItemId}`; } } : undefined,
        });
      }}
      connected={connected}
    />
    <EditProjectModal
      open={showEditProject}
      project={project}
      send={send}
      actionResults={actionResults}
      onClose={() => { setShowEditProject(false); }}
      onSaved={(name) => { onToast?.({ id: `${String(Date.now())}-project-updated`, tone: 'ok', message: `Project "${name}" updated.`, source: 'Projects' }); }}
      connected={connected}
    />
  </div>;
}

function EpicRow({ epic, state, projectId }: {
  epic: EpicRowData; state: MsqWebState; projectId: string;
}): React.JSX.Element {
  const items = useMemo(() => Object.values(state.featureCatalog).filter((item) => item.epicId === epic.epicId), [epic.epicId, state.featureCatalog]);
  const navigateToEpic = (): void => { window.location.hash = `/projects/${projectId}/epics/${epic.epicId}`; };

  return <div
    role="link"
    tabIndex={0}
    aria-label={epic.title}
    onClick={navigateToEpic}
    onKeyDown={(event) => { if (event.key === 'Enter') navigateToEpic(); }}
    style={rowStyle}
    onFocus={(event) => { event.currentTarget.style.outline = '1px solid var(--accent-info)'; }}
    onBlur={(event) => { event.currentTarget.style.outline = 'none'; }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
      <div style={{ flex: '1 1 260px', minWidth: 200 }}>
        <h3 style={{ margin: 0 }}>{epic.title}</h3>
        <p style={{ ...muted, marginTop: 4, fontSize: 'var(--text-xs)' }}>
          created {new Date(epic.createdAt).toLocaleDateString()} · updated {new Date(epic.updatedAt).toLocaleDateString()}
        </p>
        <p style={{ margin: '2px 0 0', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
          {items.length === 0 ? 'no work items yet' : `${String(items.length)} work items`}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <StatusPill status={epic.status === 'done' ? 'done' : epic.status === 'in_progress' ? 'running' : 'not_started'} spinner={false} />
        <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-sm)' }}>›</span>
      </div>
    </div>
  </div>;
}

const heading: React.CSSProperties = { margin: '0 0 10px', fontFamily: 'var(--font-display)', fontWeight: 400 };
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
const muted: React.CSSProperties = { color: 'var(--text-dim)', margin: '4px 0' };
const tags: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 };
const rowStyle: React.CSSProperties = {
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-panel)',
  padding: 12,
  marginBottom: 10,
  cursor: 'pointer',
};
