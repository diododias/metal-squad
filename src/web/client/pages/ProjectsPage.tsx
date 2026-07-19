import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { Card } from '../components/core/Card.js';
import { EditableTextField } from '../components/core/EditableTextField.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { PageHeader } from '../PageHeader.js';
import { RepositoriesSection } from '../components/project/RepositoriesSection.js';
import { formatTokens } from '../lib/format.js';
import type { MsqWebState, ProjectSummary, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

const PAGE_SIZE = 12;
let requestSequence = 0;

function nextRequestId(prefix: string): string {
  requestSequence += 1;
  return `${prefix}-${String(Date.now())}-${String(requestSequence)}`;
}

interface ProjectDraft {
  name: string;
  description: string;
  expectedRevision: number;
  pendingRequestId?: string;
  error?: string;
}

export interface ProjectsPageProps {
  state: MsqWebState;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
}

function healthFor(projectId: string, repositories: MsqWebState['repositories']): 'ok' | 'unchecked' | 'unavailable' {
  const health = repositories.filter((repository) => repository.projectId === projectId).map((repository) => repository.health);
  if (health.includes('unavailable')) return 'unavailable';
  if (health.includes('unchecked')) return 'unchecked';
  return 'ok';
}

function healthStatus(health: ReturnType<typeof healthFor>): { status: 'done' | 'blocked' | 'failed'; label: string } {
  if (health === 'ok') return { status: 'done', label: 'healthy' };
  if (health === 'unchecked') return { status: 'blocked', label: 'health unchecked' };
  return { status: 'failed', label: 'repository unavailable' };
}

function projectDraft(project: ProjectSummary): ProjectDraft {
  return { name: project.name, description: project.description ?? '', expectedRevision: project.revision };
}

export function ProjectsPage({ state, send, actionResults }: ProjectsPageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'position' | 'activity'>('position');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createRequestId, setCreateRequestId] = useState<string>();
  const [createError, setCreateError] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, ProjectDraft>>({});
  const handledResults = useRef(new Set<string>());

  useEffect(() => { setPage(0); }, [query, order]);
  useEffect(() => {
    for (const [requestId, result] of Object.entries(actionResults)) {
      if (handledResults.current.has(requestId)) continue;
      if (requestId !== createRequestId && !Object.values(drafts).some((draft) => draft.pendingRequestId === requestId)) continue;
      handledResults.current.add(requestId);
      if (requestId === createRequestId) {
        setCreateRequestId(undefined);
        if (result.payload.ok) {
          setCreateName('');
          setCreateDescription('');
          setCreateError(undefined);
          setShowCreate(false);
        } else setCreateError(result.payload.error.message);
      } else {
        setDrafts((current) => Object.fromEntries(Object.entries(current).map(([projectId, draft]) => {
          if (draft.pendingRequestId !== requestId) return [projectId, draft];
          const payload = result.payload;
          if (payload.ok) {
            if (payload.entity !== null && 'revision' in payload.entity) return [projectId, { ...draft, expectedRevision: payload.entity.revision, pendingRequestId: undefined, error: undefined }];
            return [projectId, draft];
          }
          return [projectId, { ...draft, pendingRequestId: undefined, error: payload.error.message }];
        })));
      }
    }
  }, [actionResults, createRequestId, drafts]);

  const projects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.projects
      .filter((project) => project.archivedAt === null && (!needle || project.name.toLowerCase().includes(needle)))
      .sort((left, right) => order === 'position'
        ? left.position - right.position || left.name.localeCompare(right.name)
        : right.activeRuns - left.activeRuns || (right.tokens.totalTokens ?? 0) - (left.tokens.totalTokens ?? 0) || left.position - right.position);
  }, [order, query, state.projects]);
  const pageCount = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const visibleProjects = projects.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const startCreate = (): void => {
    const name = createName.trim();
    if (!name) { setCreateError('Enter a project name.'); return; }
    const requestId = nextRequestId('project-create');
    setCreateError(undefined);
    setCreateRequestId(requestId);
    send({ type: 'action:createProject', requestId, name, description: createDescription.trim() || null });
  };
  const saveProject = (project: ProjectSummary): void => {
    const draft = drafts[project.projectId] ?? projectDraft(project);
    const name = draft.name.trim();
    if (!name) {
      setDrafts((current) => ({ ...current, [project.projectId]: { ...draft, error: 'Enter a project name.' } }));
      return;
    }
    const patch: { name?: string; description?: string | null } = {};
    if (name !== project.name) patch.name = name;
    if (draft.description !== (project.description ?? '')) patch.description = draft.description || null;
    if (!Object.keys(patch).length) return;
    const requestId = nextRequestId('project-update');
    setDrafts((current) => ({ ...current, [project.projectId]: { ...draft, pendingRequestId: requestId, error: undefined } }));
    send({ type: 'action:updateProject', requestId, projectId: project.projectId, expectedRevision: draft.expectedRevision, patch });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="Projects"
        actions={<Button variant="primary" size="sm" onClick={() => { setShowCreate((current) => !current); }}>{showCreate ? 'cancel' : 'new project'}</Button>}
        filters={<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input aria-label="Search projects" value={query} onChange={(event) => { setQuery(event.target.value); }} placeholder="Search projects…" style={controlStyle} />
          <select aria-label="Project order" value={order} onChange={(event) => { setOrder(event.target.value as 'position' | 'activity'); }} style={controlStyle}>
            <option value="position">position</option><option value="activity">recent activity</option>
          </select>
        </div>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {showCreate && <section aria-label="Create project" style={panelStyle}>
          <h2 style={sectionTitleStyle}>New project</h2>
          <EditableTextField id="new-project-name" label="Name" value={createName} initialValue="" placeholder="Project name" onChange={setCreateName} disabled={Boolean(createRequestId)} />
          <label htmlFor="new-project-description" style={labelStyle}>Description</label>
          <textarea id="new-project-description" value={createDescription} disabled={Boolean(createRequestId)} onChange={(event) => { setCreateDescription(event.target.value); }} placeholder="What is this Project for?" style={{ ...controlStyle, minHeight: 72, resize: 'vertical', width: '100%', boxSizing: 'border-box', marginTop: 4 }} />
          {createError && <div role="alert" style={errorStyle}>{createError}</div>}
          <div style={{ marginTop: 10 }}><Button variant="primary" size="sm" disabled={Boolean(createRequestId)} onClick={startCreate}>{createRequestId ? 'creating…' : 'create project'}</Button></div>
        </section>}
        {projects.length === 0 ? <section style={{ ...panelStyle, textAlign: 'center', color: 'var(--text-dim)', padding: 36 }}>
          <h2 style={sectionTitleStyle}>{query ? 'No matching Projects' : 'No Projects yet'}</h2>
          <p>{query ? 'Try a different name.' : 'Create your first Project to organize repositories, Epics, and Work Items.'}</p>
          {!query && <Button variant="primary" onClick={() => { setShowCreate(true); }}>create your first Project</Button>}
        </section> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 12 }}>
          {visibleProjects.map((project) => <ProjectCard key={project.projectId} project={project} repositories={state.repositories} actionResults={actionResults} send={send} draft={drafts[project.projectId] ?? projectDraft(project)} onDraft={(draft) => { setDrafts((current) => ({ ...current, [project.projectId]: draft })); }} onSave={() => { saveProject(project); }} />)}
        </div>}
        {projects.length > PAGE_SIZE && <div aria-label="Project pagination" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
          <Button size="sm" disabled={page === 0} onClick={() => { setPage((current) => current - 1); }}>previous</Button><span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>page {page + 1} of {pageCount}</span><Button size="sm" disabled={page + 1 >= pageCount} onClick={() => { setPage((current) => current + 1); }}>next</Button>
        </div>}
      </div>
    </div>
  );
}

function ProjectCard({ project, repositories, actionResults, send, draft, onDraft, onSave }: { project: ProjectSummary; repositories: MsqWebState['repositories']; actionResults: ProjectsPageProps['actionResults']; send: ProjectsPageProps['send']; draft: ProjectDraft; onDraft: (draft: ProjectDraft) => void; onSave: () => void }): React.JSX.Element {
  const linkedRepositories = repositories.filter((repository) => repository.projectId === project.projectId);
  const health = healthStatus(healthFor(project.projectId, repositories));
  const dirty = draft.name !== project.name || draft.description !== (project.description ?? '');
  return <Card style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <EditableTextField id={`project-${project.projectId}-name`} label="Name" value={draft.name} initialValue={project.name} disabled={Boolean(draft.pendingRequestId)} onChange={(name) => { onDraft({ ...draft, name, error: undefined }); }} />
    <label htmlFor={`project-${project.projectId}-description`} style={labelStyle}>Description</label>
    <textarea id={`project-${project.projectId}-description`} value={draft.description} disabled={Boolean(draft.pendingRequestId)} onChange={(event) => { onDraft({ ...draft, description: event.target.value, error: undefined }); }} placeholder="No description" style={{ ...controlStyle, minHeight: 64, resize: 'vertical', width: '100%', boxSizing: 'border-box', marginTop: -6 }} />
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><StatusPill status={health.status} label={health.label} spinner={false} /><StatusPill status={project.activeRuns > 0 ? 'running' : 'aborted'} label={`${String(project.activeRuns)} active runs`} spinner={false} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}><Metric label="repos" value={String(linkedRepositories.length)} /><Metric label="Epics" value={String(project.counts.epics)} /><Metric label="Work Items" value={String(project.counts.workItems)} /><Metric label="recent tokens" value={formatTokens(project.tokens.totalTokens)} /></div>
    <RepositoriesSection project={project} repositories={repositories} actionResults={actionResults} send={send} />
    {draft.error && <div role="alert" style={errorStyle}>{draft.error}{draft.error.includes('changed') && ' Your draft is preserved; reload the current values and reapply it.'}</div>}
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>Project details (Epics and Work Items) arrive in PRJ-12.</span><Button variant="primary" size="sm" disabled={!dirty || Boolean(draft.pendingRequestId)} onClick={onSave}>{draft.pendingRequestId ? 'saving…' : 'save'}</Button></div>
  </Card>;
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element { return <div><div style={{ color: 'var(--text-faint)' }}>{label}</div><strong style={{ color: 'var(--text-primary)' }}>{value}</strong></div>; }

const panelStyle: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 };
const sectionTitleStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)', fontWeight: 400 };
const labelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-dim)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', marginTop: 8 };
const controlStyle: React.CSSProperties = { background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', padding: '7px 10px' };
const errorStyle: React.CSSProperties = { color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', marginTop: 8 };
