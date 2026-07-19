/* eslint-disable @typescript-eslint/no-confusing-void-expression, @typescript-eslint/restrict-template-expressions */
import React, { useMemo, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { Card } from '../components/core/Card.js';
import { EditableTextField } from '../components/core/EditableTextField.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { PageHeader } from '../PageHeader.js';
import type { EpicRow } from '../../../db/repo.js';
import type { MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

const PAGE_SIZE = 8;
let sequence = 0;
const requestId = (prefix: string): string => `${prefix}-${Date.now()}-${++sequence}`;

export function ProjectDetailPage({ state, projectId, send, actionResults, onBack }: {
  state: MsqWebState; projectId: string; send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>; onBack: () => void;
}): React.JSX.Element {
  const project = state.projects.find((item) => item.projectId === projectId);
  const repos = state.repositories.filter((repo) => repo.projectId === projectId);
  const epics = state.epics.filter((epic) => epic.projectId === projectId && epic.archivedAt === null);
  void actionResults;
  const [epicTitle, setEpicTitle] = useState('');
  const [workTitle, setWorkTitle] = useState('');
  const [epicId, setEpicId] = useState('');
  const [repoId, setRepoId] = useState('');
  const [pageByEpic, setPageByEpic] = useState<Record<string, number>>({});
  if (!project) return <div style={{ padding: 24 }}><p>Project not found or no longer active.</p><Button onClick={onBack}>back to Projects</Button></div>;
  const createEpic = (): void => { if (epicTitle.trim()) send({ type: 'action:createEpic', requestId: requestId('epic'), projectId, title: epicTitle.trim() }); };
  const createWorkItem = (): void => { if (workTitle.trim() && epicId && repoId) send({ type: 'action:createWorkItem', requestId: requestId('work-item'), epicId, repoId, title: workTitle.trim() }); };
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <PageHeader title={project.name} breadcrumb={<button onClick={onBack} style={linkStyle}>Projects</button>} />
    <main style={{ overflow: 'auto', padding: 20, display: 'grid', gap: 16 }}>
      <Card><p style={{ margin: 0, color: 'var(--text-dim)' }}>{project.description ?? 'No project description.'}</p><div style={tags}><Tag>{repos.length} repos</Tag><Tag>{project.counts.epics} Epics</Tag><Tag>{project.counts.workItems} Work Items</Tag><StatusPill status={project.activeRuns ? 'running' : 'aborted'} label={`${project.activeRuns} active runs`} spinner={false} /></div></Card>
      <Card><h2 style={heading}>Repositories</h2>{repos.length ? <div style={tags}>{repos.map((repo) => <Tag key={repo.repoId}>{repo.label} · {repo.health}</Tag>)}</div> : <p style={muted}>No repository is linked. You can still create Epics; Work Items require a target repository.</p>}</Card>
      <Card><h2 style={heading}>Create Epic</h2><EditableTextField id="new-epic-title" label="Title" value={epicTitle} initialValue="" onChange={setEpicTitle} /><Button variant="primary" size="sm" onClick={createEpic}>create Epic</Button></Card>
      <Card><h2 style={heading}>Create Work Item</h2>{repos.length === 0 ? <p style={muted}>Link a repository before creating a Work Item. The server rejects targets outside this Project.</p> : <div style={{ display: 'grid', gap: 10 }}><EditableTextField id="new-work-item-title" label="Title" value={workTitle} initialValue="" onChange={setWorkTitle} /><select aria-label="Epic" value={epicId} onChange={(e) => setEpicId(e.target.value)} style={control}><option value="">Select an Epic</option>{epics.map((epic) => <option key={epic.epicId} value={epic.epicId}>{epic.title}</option>)}</select><select aria-label="Repository" value={repoId} onChange={(e) => setRepoId(e.target.value)} style={control}><option value="">Select a repository</option>{repos.map((repo) => <option key={repo.repoId} value={repo.repoId}>{repo.label}</option>)}</select><Button variant="primary" size="sm" disabled={!workTitle.trim() || !epicId || !repoId} onClick={createWorkItem}>create Work Item</Button></div>}</Card>
      <section><h2 style={heading}>Epics</h2>{epics.length ? epics.map((epic) => <EpicCard key={epic.epicId} epic={epic} state={state} page={pageByEpic[epic.epicId] ?? 0} onPage={(page) => setPageByEpic((current) => ({ ...current, [epic.epicId]: page }))} />) : <Card><p style={muted}>No Epics yet.</p></Card>}</section>
    </main>
  </div>;
}

function EpicCard({ epic, state, page, onPage }: { epic: EpicRow; state: MsqWebState; page: number; onPage: (page: number) => void }): React.JSX.Element {
  const items = useMemo(() => Object.values(state.featureCatalog).filter((item) => item.epicId === epic.epicId), [epic.epicId, state.featureCatalog]);
  const visible = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const completed = items.filter((item) => state.runs.some((run) => run.featureId === item.id && run.status === 'done')).length;
  const repoCounts = new Map<string, number>(); items.forEach((item) => repoCounts.set(item.repoLabel ?? 'unresolved', (repoCounts.get(item.repoLabel ?? 'unresolved') ?? 0) + 1));
  return <Card style={{ marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><div><h3 style={{ margin: 0 }}>{epic.title}</h3>{epic.description && <p style={muted}>{epic.description}</p>}</div><StatusPill status={epic.status === 'done' ? 'done' : epic.status === 'in_progress' ? 'running' : 'aborted'} label={`manual: ${epic.status}`} spinner={false} /></div><div style={tags}><Tag>derived progress: {completed}/{items.length}</Tag>{[...repoCounts].map(([label, count]) => <Tag key={label}>{label}: {count}</Tag>)}</div>{visible.map((item) => { const run = state.runs.find((candidate) => candidate.featureId === item.id); return <div key={item.id} style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 10, marginTop: 10 }}><strong>{item.title}</strong><div style={tags}><Tag>{item.workItemType}</Tag><Tag>{item.repoLabel ?? 'unresolved repo'}</Tag><StatusPill status={run?.status ?? 'aborted'} label={run?.status ?? 'not started'} spinner={false} /><Tag>workflow: {item.workflow.stages.join(' → ') || 'none'}</Tag>{item.dependsOn.map((dependency) => <Tag key={dependency}>depends: {dependency}</Tag>)}</div>{item.integrityIssue && <p role="alert" style={{ color: 'var(--accent-warn)' }}>{item.integrityIssue}</p>}</div>; })}{items.length > PAGE_SIZE && <div style={{ marginTop: 10, display: 'flex', gap: 8 }}><Button size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>previous</Button><Button size="sm" disabled={(page + 1) * PAGE_SIZE >= items.length} onClick={() => onPage(page + 1)}>next</Button></div>}</Card>;
}
const heading: React.CSSProperties = { margin: '0 0 10px', fontFamily: 'var(--font-display)', fontWeight: 400 };
const muted: React.CSSProperties = { color: 'var(--text-dim)', margin: '4px 0' };
const tags: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 };
const control: React.CSSProperties = { background: 'var(--bg-sunken)', color: 'var(--text-primary)', border: '1px solid var(--border-dim)', padding: 8, borderRadius: 'var(--radius-sm)' };
const linkStyle: React.CSSProperties = { background: 'none', border: 0, color: 'var(--accent-info)', padding: 0, cursor: 'pointer' };
