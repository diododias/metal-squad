import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { PageHeader } from '../PageHeader.js';
import { isRevisionConflictMessage } from '../lib/actionFeedback.js';
import { EditableTextField } from '../components/core/EditableTextField.js';
import type { MsqWebState, ProjectSummary, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

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

function projectDraft(project: ProjectSummary): ProjectDraft {
  return { name: project.name, description: project.description ?? '', expectedRevision: project.revision };
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `updated ${day}/${month}/${String(year)}`;
}

export function ProjectsPage({ state, send, actionResults }: ProjectsPageProps): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createRequestId, setCreateRequestId] = useState<string>();
  const [createError, setCreateError] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, ProjectDraft>>({});
  const handledResults = useRef(new Set<string>());

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
          if (result.payload.ok && 'entity' in result.payload) return [projectId, { ...draft, expectedRevision: (result.payload as { entity: { revision: number } }).entity.revision, pendingRequestId: undefined, error: undefined }];
          if (!result.payload.ok && 'error' in result.payload) return [projectId, { ...draft, pendingRequestId: undefined, error: (result.payload as { error: { message: string } }).error.message }];
          return [projectId, draft];
        })));
      }
    }
  }, [actionResults, createRequestId, drafts]);

  const projects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.projects.filter((project) => {
      if (needle && !project.name.toLowerCase().includes(needle) && !(project.description ?? '').toLowerCase().includes(needle)) return false;
      if (statusFilter === 'active') return project.archivedAt === null;
      if (statusFilter === 'archived') return project.archivedAt !== null;
      return true;
    }).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }, [query, statusFilter, state.projects]);

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

  const totalProjects = state.projects.filter((p) => p.archivedAt === null).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="Projects"
        description={`${String(totalProjects)} project${totalProjects !== 1 ? 's' : ''} tracked by msq`}
        actions={
          <Button variant="primary" size="sm" onClick={() => { setShowCreate((c) => !c); }}>
            {showCreate ? 'cancel' : '+ Novo Projeto'}
          </Button>
        }
        filters={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              aria-label="Search projects"
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              placeholder="Search Projects..."
              style={{ ...controlStyle, flex: '1 1 240px', minWidth: 160 }}
            />
            <select
              aria-label="Status filter"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); }}
              style={controlStyle}
            >
              <option value="all">all statuses</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={statusFilter !== 'active'}
                onChange={(e) => { setStatusFilter(e.target.checked ? 'all' : 'active'); }}
                style={{ accentColor: 'var(--accent-info)', width: 14, height: 14 }}
              />
              show archived
            </label>
          </div>
        }
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {showCreate && (
          <section aria-label="Create project" style={panelStyle}>
            <h2 style={sectionTitleStyle}>New project</h2>
            <EditableTextField id="new-project-name" label="Name" value={createName} initialValue="" placeholder="Project name" onChange={setCreateName} disabled={Boolean(createRequestId)} />
            <label htmlFor="new-project-description" style={labelStyle}>Description</label>
            <textarea
              id="new-project-description"
              value={createDescription}
              disabled={Boolean(createRequestId)}
              onChange={(e) => { setCreateDescription(e.target.value); }}
              placeholder="What is this Project for?"
              style={{ ...controlStyle, minHeight: 72, resize: 'vertical', width: '100%', boxSizing: 'border-box', marginTop: 4 }}
            />
            {createError && <div role="alert" style={errorStyle}>{createError}</div>}
            <div style={{ marginTop: 10 }}>
              <Button variant="primary" size="sm" disabled={Boolean(createRequestId)} onClick={startCreate}>
                {createRequestId ? 'creating…' : 'create project'}
              </Button>
            </div>
          </section>
        )}

        {projects.length === 0 ? (
          <section style={{ ...panelStyle, textAlign: 'center', color: 'var(--text-dim)', padding: 36 }}>
            <h2 style={sectionTitleStyle}>{query ? 'No matching Projects' : 'No Projects yet'}</h2>
            <p>{query ? 'Try a different name.' : 'Create your first Project to organize repositories, Epics, and Work Items.'}</p>
            {!query && <Button variant="primary" onClick={() => { setShowCreate(true); }}>create your first Project</Button>}
          </section>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map((project) => (
              <ProjectRow
                key={project.projectId}
                project={project}
                repositories={state.repositories}
                actionResults={actionResults}
                send={send}
                draft={drafts[project.projectId] ?? projectDraft(project)}
                onDraft={(draft) => { setDrafts((c) => ({ ...c, [project.projectId]: draft })); }}
                onSave={() => { saveProject(project); }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, repositories, draft, onDraft, onSave }: {
  project: ProjectSummary;
  repositories: MsqWebState['repositories'];
  actionResults: ProjectsPageProps['actionResults'];
  send: ProjectsPageProps['send'];
  draft: ProjectDraft;
  onDraft: (draft: ProjectDraft) => void;
  onSave: () => void;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const linkedRepos = repositories.filter((r) => r.projectId === project.projectId);
  const dirty = draft.name !== project.name || draft.description !== (project.description ?? '');

  const status: 'active' | 'archived' | 'running' =
    project.archivedAt !== null ? 'archived' :
    project.activeRuns > 0 ? 'running' :
    'active';

  const pillStatus = status === 'active' ? 'done' : status === 'running' ? 'running' : 'not_started';

  const navigate = (): void => { window.location.hash = `/projects/${project.projectId}`; };

  return (
    <div
      style={rowStyle}
      role="button"
      tabIndex={0}
      aria-label={`Project ${project.name}`}
      onClick={(e) => { if ((e.target as HTMLElement).closest('[data-edit-zone]')) return; navigate(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(); }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div data-edit-zone="" style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onClick={(e) => { e.stopPropagation(); }}>
            <EditableTextField
              id={`project-${project.projectId}-name`}
              label="Name"
              value={draft.name}
              initialValue={project.name}
              disabled={Boolean(draft.pendingRequestId)}
              onChange={(name) => { onDraft({ ...draft, name, error: undefined }); }}
            />
            <label htmlFor={`project-${project.projectId}-description`} style={labelStyle}>Description</label>
            <textarea
              id={`project-${project.projectId}-description`}
              value={draft.description}
              disabled={Boolean(draft.pendingRequestId)}
              onChange={(e) => { onDraft({ ...draft, description: e.target.value, error: undefined }); }}
              placeholder="No description"
              style={{ ...controlStyle, minHeight: 56, resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
            {draft.error && (
              <div role="alert" style={errorStyle}>
                {draft.error}{isRevisionConflictMessage(draft.error) && ' Your draft is preserved; reload the current values and reapply it.'}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" size="sm" disabled={!dirty || Boolean(draft.pendingRequestId)} onClick={onSave}>
                {draft.pendingRequestId ? 'saving…' : 'save'}
              </Button>
              <Button size="sm" onClick={() => { setEditing(false); }}>cancel</Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>
                {project.name}
              </span>
              <button
                data-edit-zone=""
                aria-label="Edit project"
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                style={{ background: 'none', border: 0, color: 'var(--text-faint)', padding: '0 2px', cursor: 'pointer', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', opacity: 0.5 }}
              >
                edit
              </button>
            </div>
            {project.description && (
              <p style={{ margin: '4px 0 0', color: 'var(--text-dim)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>
                {project.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <TagPill label={`${String(linkedRepos.length)} repos`} />
              <TagPill label={`${String(project.counts.epics)} Epics`} />
              <TagPill label={`${String(project.counts.workItems)} Work Items`} />
              <TagPill label={`${String(project.activeRuns)} active runs`} />
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusPill status={pillStatus} label={status} spinner={false} />
          <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-base)' }}>›</span>
        </div>
        <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
          {formatUpdatedAt(project.updatedAt)}
        </span>
      </div>
    </div>
  );
}

function TagPill({ label }: { label: string }): React.JSX.Element {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)',
      color: 'var(--text-dim)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
      padding: '2px 8px', background: 'transparent',
    }}>
      {label}
    </span>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
  background: 'var(--bg-panel)', border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-md)', padding: '18px 20px',
  cursor: 'pointer', transition: 'border-color 0.15s',
};
const panelStyle: React.CSSProperties = { background: 'var(--bg-panel)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 };
const sectionTitleStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: 'var(--text-lg)', fontFamily: 'var(--font-display)', fontWeight: 400 };
const labelStyle: React.CSSProperties = { display: 'block', color: 'var(--text-dim)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', marginTop: 8 };
const controlStyle: React.CSSProperties = { background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', padding: '7px 10px' };
const errorStyle: React.CSSProperties = { color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', marginTop: 8 };
