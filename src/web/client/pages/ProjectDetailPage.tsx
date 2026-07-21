import React, { useMemo, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { Card } from '../components/core/Card.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { LifecycleActions } from '../components/LifecycleActions.js';
import { WorkflowTemplatesSection } from '../components/WorkflowTemplatesSection.js';
import { ProgressBar } from '../components/data/ProgressBar.js';
import { PageHeader } from '../PageHeader.js';
import type { EpicRow as EpicRowData } from '../../../db/repo.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

const PAGE_SIZE = 8;

export function ProjectDetailPage({ state, projectId, send, actionResults, onBack }: {
  state: MsqWebState; projectId: string; send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>; onBack: () => void;
}): React.JSX.Element {
  const project = state.projects.find((item) => item.projectId === projectId);
  const repos = state.repositories.filter((repo) => repo.projectId === projectId);
  const epics = state.epics.filter((epic) => epic.projectId === projectId && epic.archivedAt === null);
  const [page, setPage] = useState(0);

  if (!project) return <div style={{ padding: 24 }}><p>Project not found or no longer active.</p><Button onClick={onBack}>back to Projects</Button></div>;

  const visible = epics.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <PageHeader
      title={project.name}
      breadcrumb={[{ label: 'Projects', href: '/projects' }]}
      actions={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="primary" size="sm" disabled title="Epic creation moves to a modal in an upcoming release">+ Novo Épico</Button>
        <LifecycleActions
          kind="project"
          id={project.projectId}
          name={project.name}
          revision={project.revision}
          allowed={state.lifecycle?.[`project:${project.projectId}`]}
          send={send}
          actionResults={actionResults}
        />
      </div>}
    />
    <main style={{ overflow: 'auto', padding: 20, display: 'grid', gap: 16 }}>
      <Card>
        <p style={{ margin: 0, color: 'var(--text-dim)' }}>{project.description ?? 'No project description.'}</p>
        <div style={tags}>
          <Tag>{repos.length} repos</Tag>
          <Tag>{project.counts.epics} Epics</Tag>
          <Tag>{project.counts.workItems} Work Items</Tag>
          <StatusPill status={project.activeRuns ? 'running' : 'aborted'} label={`${String(project.activeRuns)} active runs`} spinner={false} />
        </div>
      </Card>
      <Card><h2 style={heading}>Repositories</h2>{repos.length ? <div style={tags}>{repos.map((repo) => <Tag key={repo.repoId}>{repo.label} · {repo.health}</Tag>)}</div> : <p style={muted}>No repository is linked. You can still create Epics; Work Items require a target repository.</p>}</Card>
      <section>
        <h2 style={heading}>Epics</h2>
        {epics.length === 0 && <Card>
          <p style={muted}>No Epics yet.</p>
          <Button variant="primary" size="sm" disabled title="Epic creation moves to a modal in an upcoming release">+ Novo Épico</Button>
        </Card>}
        {visible.map((epic) => <EpicRow key={epic.epicId} epic={epic} state={state} projectId={projectId} send={send} actionResults={actionResults} />)}
        {epics.length > PAGE_SIZE && <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <Button size="sm" disabled={page === 0} onClick={() => { setPage(page - 1); }}>previous</Button>
          <Button size="sm" disabled={(page + 1) * PAGE_SIZE >= epics.length} onClick={() => { setPage(page + 1); }}>next</Button>
        </div>}
      </section>
      <section><h2 style={heading}>Workflow Templates</h2><WorkflowTemplatesSection state={state} projectId={projectId} send={send} actionResults={actionResults} /></section>
    </main>
  </div>;
}

function EpicRow({ epic, state, projectId, send, actionResults }: {
  epic: EpicRowData; state: MsqWebState; projectId: string;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
}): React.JSX.Element {
  const items = useMemo(() => Object.values(state.featureCatalog).filter((item) => item.epicId === epic.epicId), [epic.epicId, state.featureCatalog]);
  const completed = useMemo(() => items.filter((item) => state.runs.some((run) => run.featureId === item.id && run.status === 'done')).length, [items, state.runs]);
  const repoCounts = new Map<string, number>();
  items.forEach((item) => repoCounts.set(item.repoLabel ?? 'unresolved', (repoCounts.get(item.repoLabel ?? 'unresolved') ?? 0) + 1));
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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 260px', minWidth: 200 }}>
        <h3 style={{ margin: 0 }}>{epic.title}</h3>
        {epic.description && <p style={muted}>{epic.description}</p>}
        <div style={{ marginTop: 8, maxWidth: 320 }}>
          <ProgressBar
            percent={items.length ? (completed / items.length) * 100 : 0}
            tone="ok"
            label={`derived progress: ${String(completed)}/${String(items.length)}`}
          />
        </div>
        <div style={tags}>
          <Tag>{items.length} Work Items</Tag>
          {[...repoCounts].map(([label, count]) => <Tag key={label}>{label}: {count}</Tag>)}
        </div>
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        onClick={(event) => { event.stopPropagation(); }}
        onKeyDown={(event) => { event.stopPropagation(); }}
      >
        <StatusPill status={epic.status === 'done' ? 'done' : epic.status === 'in_progress' ? 'running' : 'aborted'} label={`manual: ${epic.status}`} spinner={false} />
        <LifecycleActions kind="epic" id={epic.epicId} name={epic.title} revision={epic.revision} allowed={state.lifecycle?.[`epic:${epic.epicId}`]} send={send} actionResults={actionResults} />
      </div>
    </div>
  </div>;
}

const heading: React.CSSProperties = { margin: '0 0 10px', fontFamily: 'var(--font-display)', fontWeight: 400 };
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
