import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { Card } from '../components/core/Card.js';
import { Tag } from '../components/core/Tag.js';
import { LifecycleActions } from '../components/LifecycleActions.js';
import { Modal } from '../components/feedback/Modal.js';
import { PageHeader } from '../PageHeader.js';
import type { ArchivedEntry, MsqWebState, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

const PAGE_SIZE = 20;
let requestSequence = 0;

function nextRequestId(prefix: string): string {
  requestSequence += 1;
  return `${prefix}-${String(Date.now())}-${String(requestSequence)}`;
}

export interface ArchivedPageProps {
  state: MsqWebState;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
  archivedResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:archivedResult' }>>;
  auditTrailResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:auditTrailResult' }>>;
}

/** `/archived` (PRJ-19): lists archived Projects/Epics/Work Items, filtered and
 * paginated server-side, and offers Restore through the same `LifecycleActions`
 * component the live pages use — the policy is never recomputed on the client.
 * Restore results funnel through `actionResults` (the shared `action:result`
 * channel); a successful restore drops the row from the current page and the
 * total, without waiting for the next full snapshot. */
export function ArchivedPage({ state, send, actionResults, archivedResults, auditTrailResults }: ArchivedPageProps): React.JSX.Element {
  const [kind, setKind] = useState<'all' | 'project' | 'epic' | 'work_item'>('all');
  const [projectId, setProjectId] = useState('');
  const [repoId, setRepoId] = useState('');
  const [page, setPage] = useState(0);
  const [queryRequestId, setQueryRequestId] = useState<string | null>(null);
  const [restoredIds, setRestoredIds] = useState<Set<string>>(new Set());
  const [timelineEntry, setTimelineEntry] = useState<ArchivedEntry | null>(null);

  useEffect(() => { setPage(0); setRestoredIds(new Set()); }, [kind, projectId, repoId]);

  useEffect(() => {
    const requestId = nextRequestId('archived-query');
    setQueryRequestId(requestId);
    send({
      type: 'action:queryArchived',
      requestId,
      filters: {
        ...(kind !== 'all' ? { kind } : {}),
        ...(projectId ? { projectId } : {}),
        ...(repoId ? { repoId } : {}),
      },
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
  }, [kind, projectId, repoId, page, send]);

  const result = queryRequestId ? archivedResults[queryRequestId] : undefined;
  const items = (result?.payload.ok ? result.payload.items : []).filter((item) => !restoredIds.has(item.id));
  const total = result?.payload.ok ? result.payload.total : 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const loadError = result && !result.payload.ok ? result.payload.error.message : null;

  // A successful restore removes its row immediately instead of waiting for
  // the next `action:queryArchived` round trip, so the list reacts as fast as
  // the live pages do. Entity ids are unique across kinds, so tracking bare
  // ids is enough — no need to resolve which kind each result belongs to.
  const handledRestores = useRef(new Set<string>());
  useEffect(() => {
    for (const [id, entry] of Object.entries(actionResults)) {
      if (handledRestores.current.has(id) || !entry.payload.ok) continue;
      handledRestores.current.add(id);
      const { entity } = entry.payload as { entity: { workItemId?: string; epicId?: string; projectId?: string } };
      const restoredId = entity.workItemId ?? entity.epicId ?? entity.projectId;
      if (restoredId) setRestoredIds((current) => new Set(current).add(restoredId));
    }
  }, [actionResults]);

  const projectOptions = useMemo(
    () => [...state.projects].sort((left, right) => left.name.localeCompare(right.name)),
    [state.projects],
  );
  const repoOptions = useMemo(
    () => state.repositories.filter((repo) => !projectId || repo.projectId === projectId),
    [state.repositories, projectId],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PageHeader
        title="Archived"
        filters={<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select aria-label="Level" value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); }} style={controlStyle}>
            <option value="all">all levels</option>
            <option value="project">Project</option>
            <option value="epic">Epic</option>
            <option value="work_item">Work Item</option>
          </select>
          <select aria-label="Project filter" value={projectId} onChange={(event) => { setProjectId(event.target.value); setRepoId(''); }} style={controlStyle}>
            <option value="">all Projects</option>
            {projectOptions.map((project) => <option key={project.projectId} value={project.projectId}>{project.name}</option>)}
          </select>
          <select aria-label="Repository filter" value={repoId} onChange={(event) => { setRepoId(event.target.value); }} style={controlStyle} disabled={kind !== 'all' && kind !== 'work_item'}>
            <option value="">all repositories</option>
            {repoOptions.map((repo) => <option key={repo.repoId} value={repo.repoId}>{repo.label}</option>)}
          </select>
        </div>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loadError && <div role="alert" style={errorStyle}>{loadError}</div>}
        {!loadError && items.length === 0 && (
          <Card><p style={muted}>No archived items match these filters.</p></Card>
        )}
        {items.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((item) => (
              <ArchivedRow
                key={`${item.kind}:${item.id}`}
                item={item}
                send={send}
                actionResults={actionResults}
                onOpenTimeline={() => { setTimelineEntry(item); }}
                onFindAncestor={item.parentId && item.kind !== 'project' ? (): void => {
                  setKind(item.kind === 'work_item' ? 'epic' : 'project');
                  setProjectId(item.kind === 'epic' && item.parentId ? item.parentId : '');
                } : undefined}
              />
            ))}
          </div>
        )}
        {total > PAGE_SIZE && (
          <div aria-label="Archived pagination" style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
            <Button size="sm" disabled={page === 0} onClick={() => { setPage((current) => current - 1); }}>previous</Button>
            <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>page {page + 1} of {pageCount}</span>
            <Button size="sm" disabled={page + 1 >= pageCount} onClick={() => { setPage((current) => current + 1); }}>next</Button>
          </div>
        )}
      </div>
      <Modal open={timelineEntry !== null} onClose={() => { setTimelineEntry(null); }} width={520}>
        {timelineEntry && (
          <AuditTimeline entry={timelineEntry} send={send} auditTrailResults={auditTrailResults} />
        )}
      </Modal>
    </div>
  );
}

const KIND_LABEL: Record<ArchivedEntry['kind'], string> = { project: 'Project', epic: 'Epic', work_item: 'Work Item' };

function ArchivedRow({ item, send, actionResults, onOpenTimeline, onFindAncestor }: {
  item: ArchivedEntry;
  send: (message: WebSocketClientMessage) => void;
  actionResults: ArchivedPageProps['actionResults'];
  onOpenTimeline: () => void;
  onFindAncestor?: () => void;
}): React.JSX.Element {
  const blockedByAncestor = Boolean(item.allowed.blockedReason) && !item.allowed.restore && onFindAncestor;
  return (
    <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Tag>{KIND_LABEL[item.kind]}</Tag>
          {item.workItemType && <Tag>{item.workItemType}</Tag>}
          <strong style={{ fontSize: 'var(--text-sm)' }}>{item.title}</strong>
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>
          {item.parentLabel && <span>{item.parentLabel} · </span>}
          {item.repoLabel && <span>{item.repoLabel} · </span>}
          archived {new Date(item.archivedAt).toLocaleString()}
        </div>
        {item.allowed.blockedReason && !item.allowed.restore && (
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-2xs)' }}>
            {item.allowed.blockedReason}
            {blockedByAncestor && (
              <>
                {' '}
                <button type="button" onClick={onFindAncestor} style={linkButtonStyle}>restore {item.parentLabel ?? 'ancestor'} first</button>
              </>
            )}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="neutral" size="sm" onClick={onOpenTimeline}>Audit trail</Button>
        <LifecycleActions
          kind={item.kind}
          id={item.id}
          name={item.title}
          revision={item.revision}
          allowed={item.allowed}
          send={send}
          actionResults={actionResults}
        />
      </div>
    </Card>
  );
}

function AuditTimeline({ entry, send, auditTrailResults }: {
  entry: ArchivedEntry;
  send: (message: WebSocketClientMessage) => void;
  auditTrailResults: ArchivedPageProps['auditTrailResults'];
}): React.JSX.Element {
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    const id = nextRequestId('audit-trail');
    setRequestId(id);
    send({ type: 'action:queryAuditTrail', requestId: id, entityKind: entry.kind, entityId: entry.id });
  }, [entry.kind, entry.id, send]);

  const result = requestId ? auditTrailResults[requestId] : undefined;

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Tag tone="accent">{KIND_LABEL[entry.kind]}</Tag>
        <strong style={{ fontSize: 'var(--text-sm)' }}>{entry.title}</strong>
      </div>
      {!result && <p style={muted}>loading audit trail…</p>}
      {result && !result.payload.ok && <div role="alert" style={errorStyle}>{result.payload.error.message}</div>}
      {result && result.payload.ok && result.payload.events.length === 0 && <p style={muted}>No audit events recorded yet.</p>}
      {result && result.payload.ok && result.payload.events.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, maxHeight: 360, overflow: 'auto' }}>
          {result.payload.events.map((event) => (
            <li key={event.id} style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--text-xs)' }}>
                <strong>{event.action}</strong>
                <span style={{ color: 'var(--text-dim)' }}>{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ color: 'var(--text-faint)', fontSize: 'var(--text-2xs)' }}>by {event.actor ?? 'system'}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const muted: React.CSSProperties = { color: 'var(--text-dim)', margin: '4px 0' };
const errorStyle: React.CSSProperties = { color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', marginTop: 8 };
const controlStyle: React.CSSProperties = { background: 'var(--bg-sunken)', border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', padding: '7px 10px' };
const linkButtonStyle: React.CSSProperties = { background: 'none', border: 0, color: 'var(--accent-info)', padding: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' };
