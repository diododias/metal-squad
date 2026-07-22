import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../core/Button.js';
import { EditableTextField } from '../core/EditableTextField.js';
import { Modal } from '../feedback/Modal.js';
import { WorkflowStepper } from '../navigation/WorkflowStepper.js';
import { CONNECTION_LOST_MESSAGE, readActionOutcome } from '../../lib/actionFeedback.js';
import type { MsqWebState, MsqWorkItemType, WebSocketClientMessage, WebSocketServerMessage } from '../../../types.js';

let sequence = 0;
const nextRequestId = (prefix: string): string => `${prefix}-${String(Date.now())}-${String(++sequence)}`;

interface PreviewState {
  requestId: string;
  epicId: string;
  repoId: string;
  workItemType: MsqWorkItemType;
  result?: { stages: string[]; templateId: string; templateVersion: number; origin: string } | { error: string };
}

export interface CreateWorkItemModalProps {
  open: boolean;
  projectId: string;
  /** Pre-selects the Epic when opened from the Epic detail page (still editable). */
  defaultEpicId?: string;
  state: MsqWebState;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
  onClose: () => void;
  /** Fired once after the server confirms creation, with the new Work Item id
   * and the Epic it was created under. */
  onCreated?: (workItemId: string, title: string, epicId: string) => void;
  /** WS connection state; a drop while a request is pending resets the modal
   * out of `creating…` with an actionable error (PF-07). */
  connected?: boolean;
}

/**
 * Modal form behind `+ Nova Feature` on the project and epic detail pages.
 * Migrates the former inline "Create Work Item" flow: draft fields, workflow
 * template preview via `action:resolveWorkflowTemplate` (re-resolved whenever
 * epic+repo+type change), and creation via the existing `action:createWorkItem`.
 * `criar` only enables with title + epic + repo + a valid preview. The Work
 * Item → repo link is final at creation; type changes later live in the
 * backlog item detail (`action:changeWorkItemType`).
 */
export function CreateWorkItemModal({ open, projectId, defaultEpicId, state, send, actionResults, onClose, onCreated, connected }: CreateWorkItemModalProps): React.JSX.Element | null {
  const epics = state.epics.filter((epic) => epic.projectId === projectId && epic.archivedAt === null);
  const repos = state.repositories.filter((repo) => repo.projectId === projectId);
  const selectableRepos = repos.filter((repo) => repo.health !== 'unavailable');

  const [title, setTitle] = useState('');
  const [epicId, setEpicId] = useState('');
  const [repoId, setRepoId] = useState('');
  const [workItemType, setWorkItemType] = useState<MsqWorkItemType>('feature');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const handledPreviewResults = useRef(new Set<string>());
  const handledCreateResults = useRef(new Set<string>());

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setEpicId(defaultEpicId ?? '');
    setRepoId(selectableRepos.length === 1 ? selectableRepos[0]?.repoId ?? '' : '');
    setWorkItemType('feature');
    setPreview(null);
    setPendingRequestId(null);
    setError(undefined);
    document.getElementById('create-work-item-title')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEpicId]);

  useEffect(() => {
    if (!open) return;
    if (!epicId || !repoId) { setPreview(null); return; }
    if (preview?.epicId === epicId && preview.repoId === repoId && preview.workItemType === workItemType) return;
    const requestId = nextRequestId('template-preview');
    setPreview({ requestId, epicId, repoId, workItemType });
    send({ type: 'action:resolveWorkflowTemplate', requestId, epicId, repoId, workItemType });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, epicId, repoId, workItemType]);

  useEffect(() => {
    if (!preview || preview.result || handledPreviewResults.current.has(preview.requestId)) return;
    const result = actionResults[preview.requestId];
    if (!result) return;
    handledPreviewResults.current.add(preview.requestId);
    const { payload } = result;
    if (payload.ok && 'preview' in payload && 'origin' in payload.preview) {
      const { stages, templateId, templateVersion, origin } = payload.preview;
      setPreview((current) => (current?.requestId === preview.requestId ? { ...current, result: { stages, templateId, templateVersion, origin } } : current));
    } else if (!payload.ok && 'error' in payload) {
      const { message } = payload.error;
      setPreview((current) => (current?.requestId === preview.requestId ? { ...current, result: { error: message } } : current));
    }
  }, [actionResults, preview]);

  useEffect(() => {
    if (!pendingRequestId || handledCreateResults.current.has(pendingRequestId)) return;
    const outcome = readActionOutcome(actionResults[pendingRequestId]);
    if (!outcome) return;
    handledCreateResults.current.add(pendingRequestId);
    setPendingRequestId(null);
    if (outcome.ok) {
      const workItemId = 'workItem' in outcome.payload ? (outcome.payload.workItem as { workItemId: string }).workItemId : '';
      onCreated?.(workItemId, title.trim(), epicId);
      onClose();
    } else {
      setError(outcome.message);
    }
  }, [actionResults, pendingRequestId, onClose, onCreated, title, epicId]);

  useEffect(() => {
    if (!pendingRequestId || connected !== false) return;
    // The in-flight request may never resolve; a retry sends a fresh requestId.
    handledCreateResults.current.add(pendingRequestId);
    setPendingRequestId(null);
    setError(CONNECTION_LOST_MESSAGE);
  }, [connected, pendingRequestId]);

  const pending = pendingRequestId !== null;

  useEffect(() => {
    if (!open || pending) return;
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return (): void => { window.removeEventListener('keydown', onKeyDown); };
  }, [open, pending, onClose]);

  if (!open) return null;

  const previewReady = preview?.epicId === epicId && preview.repoId === repoId && preview.workItemType === workItemType;
  const previewResult = previewReady ? preview.result : undefined;
  const previewValid = previewResult != null && 'stages' in previewResult;

  const createWorkItem = (): void => {
    if (!title.trim() || !epicId || !repoId || !previewValid || pending) return;
    const requestId = nextRequestId('work-item');
    setError(undefined);
    setPendingRequestId(requestId);
    send({ type: 'action:createWorkItem', requestId, epicId, repoId, workItemType, title: title.trim() });
  };

  return <Modal open={open} onClose={pending ? (): void => undefined : onClose} width={560}>
    <div role="dialog" aria-label="Create Work Item" style={{ padding: 20, display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 400 }}>+ New Feature</h2>
      {repos.length === 0 ? <>
        <p style={{ margin: 0, color: 'var(--text-dim)' }}>Link a repository before creating a Work Item. The server rejects targets outside this Project.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button size="sm" onClick={onClose}>fechar</Button></div>
      </> : <>
        <EditableTextField id="create-work-item-title" label="Title" value={title} initialValue="" onChange={setTitle} disabled={pending} placeholder="Work Item title (required)" />
        <select aria-label="Epic" value={epicId} disabled={pending} onChange={(event) => { setEpicId(event.target.value); }} style={control}>
          <option value="">Select an Epic</option>
          {epics.map((epic) => <option key={epic.epicId} value={epic.epicId}>{epic.title}</option>)}
        </select>
        <select aria-label="Repository" value={repoId} disabled={pending} onChange={(event) => { setRepoId(event.target.value); }} style={control}>
          <option value="">Select a repository</option>
          {repos.map((repo) => <option key={repo.repoId} value={repo.repoId} disabled={repo.health === 'unavailable'}>
            {repo.label} · {repo.health}{repo.health === 'unavailable' ? ' (cannot target an unavailable repository)' : ''}
          </option>)}
        </select>
        <div>
          <select aria-label="Work Item type" value={workItemType} disabled={pending} onChange={(event) => { setWorkItemType(event.target.value as MsqWorkItemType); }} style={control}>
            <option value="feature">feature</option>
            <option value="bug">bug</option>
          </select>
          <p style={{ margin: '4px 0 0', color: 'var(--text-faint)', fontSize: 'var(--text-2xs)' }}>The repository link is final; the type can be changed later in the Work Item detail.</p>
        </div>
        {epicId && repoId && (
          <div style={{ padding: 10, border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-sunken)' }}>
            <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 4 }}>workflow preview</div>
            {(!previewReady || !previewResult) && <p style={{ margin: 0, color: 'var(--text-dim)' }}>resolving template…</p>}
            {previewReady && previewResult && 'error' in previewResult && <p role="alert" style={{ margin: 0, color: 'var(--accent-danger)', fontSize: 'var(--text-xs)' }}>{previewResult.error}</p>}
            {previewReady && previewResult && 'stages' in previewResult && <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>template: {previewResult.templateId} v{previewResult.templateVersion} ({previewResult.origin})</div>
              <WorkflowStepper stages={previewResult.stages} currentStage={null} allPending size="compact" />
            </div>}
          </div>
        )}
        {error && <p role="alert" style={{ margin: 0, color: 'var(--accent-danger)', fontSize: 'var(--text-xs)' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button size="sm" disabled={pending} onClick={onClose}>cancelar</Button>
          <Button variant="primary" size="sm" disabled={pending || !title.trim() || !epicId || !repoId || !previewValid} onClick={createWorkItem}>{pending ? 'creating…' : 'criar'}</Button>
        </div>
      </>}
    </div>
  </Modal>;
}

const control: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-dim)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  padding: '7px 9px',
  boxSizing: 'border-box',
};
