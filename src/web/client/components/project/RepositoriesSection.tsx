import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../core/Button.js';
import { StatusPill } from '../core/StatusPill.js';
import { shortId } from '../../lib/entityId.js';
import type { MsqWebState, ProjectSummary, WebSocketClientMessage, WebSocketServerMessage } from '../../../types.js';

let requestSequence = 0;
function nextRequestId(action: string): string {
  requestSequence += 1;
  return `repository-${action}-${String(Date.now())}-${String(requestSequence)}`;
}

type ActionResults = Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;

export interface RepositoriesSectionProps {
  project: ProjectSummary;
  repositories: MsqWebState['repositories'];
  actionResults: ActionResults;
  send: (message: WebSocketClientMessage) => void;
}

function healthStatus(health: MsqWebState['repositories'][number]['health']): { status: 'done' | 'blocked' | 'failed'; label: string } {
  if (health === 'ok') return { status: 'done', label: 'healthy' };
  if (health === 'unavailable') return { status: 'failed', label: 'unavailable' };
  return { status: 'blocked', label: 'unchecked' };
}

export function RepositoriesSection({ project, repositories, actionResults, send }: RepositoriesSectionProps): React.JSX.Element {
  const [pendingRequestId, setPendingRequestId] = useState<string>();
  const [error, setError] = useState<string>();
  const [moveCandidateId, setMoveCandidateId] = useState<string>();
  const [addPath, setAddPath] = useState('');
  const [awaitingPathConfirm, setAwaitingPathConfirm] = useState(false);
  const handled = useRef(new Set<string>());
  const linked = repositories.filter((repository) => repository.projectId === project.projectId);
  const available = repositories.filter((repository) => repository.projectId === null);
  const transferable = repositories.filter((repository) => repository.projectId !== null && repository.projectId !== project.projectId);

  useEffect(() => {
    if (!pendingRequestId || handled.current.has(pendingRequestId)) return;
    const result = actionResults[pendingRequestId];
    if (!result) return;
    handled.current.add(pendingRequestId);
    setPendingRequestId(undefined);
    setMoveCandidateId(undefined);
    if (result.payload.ok) {
      setError(undefined);
      setAddPath('');
      setAwaitingPathConfirm(false);
      return;
    }
    // The probe send (path without confirm) is always refused with this code:
    // it is the server's request for explicit confirmation, not a failure.
    // Path resolution (realpath/allowlist) only runs on the confirmed call, so
    // there is no canonical path to show yet — the panel shows the typed one.
    if ('code' in result.payload.error && result.payload.error.code === 'REPO_PATH_CONFIRMATION_REQUIRED' && pendingRequestId.startsWith('repository-add-path-probe')) {
      setError(undefined);
      setAwaitingPathConfirm(true);
      return;
    }
    setAwaitingPathConfirm(false);
    setError(result.payload.error.message);
  }, [actionResults, pendingRequestId]);

  const dispatch = (message: WebSocketClientMessage): void => {
    if (!('requestId' in message) || typeof message.requestId !== 'string') return;
    setError(undefined);
    setPendingRequestId(message.requestId);
    send(message);
  };

  return <section aria-label={`Repositories for ${project.name}`} style={{ borderTop: '1px solid var(--border-dim)', paddingTop: 10 }}>
    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>Repositories</strong>
    {linked.length === 0 && <p style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)' }}>No repository linked — this Project is not executable. Add one by path below.</p>}
    {linked.map((repository) => {
      const health = healthStatus(repository.health);
      return <div key={repository.repoId} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <div><strong style={{ fontSize: 'var(--text-sm)' }}>{repository.label}</strong> <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>{shortId('repository', repository.repoId)}</span><div style={{ marginTop: 3 }}><StatusPill status={health.status} label={health.label} spinner={false} /> <span style={{ color: 'var(--text-faint)', fontSize: 'var(--text-xs)' }}>last checked: {repository.lastCheckedAt ?? 'never'}</span></div></div>
        <Button size="sm" variant="destructive" disabled={Boolean(pendingRequestId)} onClick={() => { dispatch({ type: 'action:unlinkRepo', requestId: nextRequestId('unlink'), projectId: project.projectId, repoId: repository.repoId }); }}>unlink</Button>
      </div>;
    })}
    {available.length > 0 && <div style={{ marginTop: 10 }}><span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>Registered repositories</span>{available.map((repository) => <div key={repository.repoId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5 }}><span style={{ fontSize: 'var(--text-xs)' }}>{repository.label} · {shortId('repository', repository.repoId)}</span><Button size="sm" disabled={Boolean(pendingRequestId)} onClick={() => { dispatch({ type: 'action:linkRepo', requestId: nextRequestId('link'), projectId: project.projectId, repoId: repository.repoId }); }}>link</Button></div>)}</div>}
    {transferable.length > 0 && <div style={{ marginTop: 10 }}><span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>Transfer an empty repository</span>{transferable.map((repository) => <div key={repository.repoId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 5 }}><span style={{ fontSize: 'var(--text-xs)' }}>{repository.label} · {shortId('repository', repository.repoId)}</span>{moveCandidateId === repository.repoId ? <span style={{ display: 'flex', gap: 5 }}><Button size="sm" variant="ok" disabled={Boolean(pendingRequestId)} onClick={() => { dispatch({ type: 'action:moveRepo', requestId: nextRequestId('move'), repoId: repository.repoId, toProjectId: project.projectId }); }}>confirm transfer</Button><Button size="sm" disabled={Boolean(pendingRequestId)} onClick={() => { setMoveCandidateId(undefined); }}>cancel</Button></span> : <Button size="sm" disabled={Boolean(pendingRequestId)} onClick={() => { setMoveCandidateId(repository.repoId); }}>transfer here</Button>}</div>)}</div>}
    <div style={{ marginTop: 10 }}>
      <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>Add a repository by path</span>
      {awaitingPathConfirm ? <div style={{ marginTop: 5, display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 'var(--text-xs)' }}>
          Register and link <code>{addPath.trim()}</code>? The server resolves the real path and derives the repository id on confirmation.
        </span>
        <span style={{ display: 'flex', gap: 5 }}>
          <Button size="sm" variant="ok" disabled={Boolean(pendingRequestId)} onClick={() => { dispatch({ type: 'action:linkRepo', requestId: nextRequestId('add-path-confirm'), projectId: project.projectId, path: addPath.trim(), confirm: true }); }}>confirm add</Button>
          <Button size="sm" disabled={Boolean(pendingRequestId)} onClick={() => { setAwaitingPathConfirm(false); }}>cancel</Button>
        </span>
      </div> : <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
        <input
          aria-label="Repository path"
          value={addPath}
          disabled={Boolean(pendingRequestId)}
          placeholder="/absolute/path/to/repo"
          onChange={(event) => { setAddPath(event.target.value); }}
          style={{
            flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', padding: '5px 8px',
            background: 'var(--bg-sunken)', color: 'var(--text-primary)',
            border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box',
          }}
        />
        <Button
          size="sm"
          disabled={Boolean(pendingRequestId) || !addPath.trim().startsWith('/')}
          onClick={() => { dispatch({ type: 'action:linkRepo', requestId: nextRequestId('add-path-probe'), projectId: project.projectId, path: addPath.trim() }); }}
        >add</Button>
      </div>}
    </div>
    {error && <div role="alert" style={{ color: 'var(--accent-warn)', fontSize: 'var(--text-xs)', marginTop: 8 }}>{error}</div>}
  </section>;
}
