import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../core/Button.js';
import { EditableTextField } from '../core/EditableTextField.js';
import { Modal } from '../feedback/Modal.js';
import { CONNECTION_LOST_MESSAGE, isRevisionConflictMessage, readActionOutcome } from '../../lib/actionFeedback.js';
import type { ProjectSummary, WebSocketClientMessage, WebSocketServerMessage } from '../../../types.js';

let sequence = 0;
const nextRequestId = (): string => `project-update-${String(Date.now())}-${String(++sequence)}`;

export interface EditProjectModalProps {
  open: boolean;
  project: ProjectSummary;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
  onClose: () => void;
  /** Fired once after the server confirms the update (PF-07 toast). */
  onSaved?: (name: string) => void;
  /** WS connection state; a drop while pending resets out of `saving…`. */
  connected?: boolean;
}

/**
 * Modal form behind `editar Projeto` on the project detail header. Edits name
 * and description over the existing `action:updateProject` with
 * `expectedRevision`; a revision conflict keeps the draft and offers
 * "reload current values" / "reapply draft" (same recovery as EpicEditor).
 * Saving closes on success; header/breadcrumb reflect via state push.
 */
export function EditProjectModal({ open, project, send, actionResults, onClose, onSaved, connected }: EditProjectModalProps): React.JSX.Element | null {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expectedRevision, setExpectedRevision] = useState(project.revision);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const handledResults = useRef(new Set<string>());

  useEffect(() => {
    if (!open) return;
    setName(project.name);
    setDescription(project.description ?? '');
    setExpectedRevision(project.revision);
    setPendingRequestId(null);
    setError(undefined);
    document.getElementById('edit-project-name')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!pendingRequestId || handledResults.current.has(pendingRequestId)) return;
    const outcome = readActionOutcome(actionResults[pendingRequestId]);
    if (!outcome) return;
    handledResults.current.add(pendingRequestId);
    setPendingRequestId(null);
    if (outcome.ok) {
      onSaved?.(name.trim());
      onClose();
    } else {
      setError(outcome.message);
    }
  }, [actionResults, pendingRequestId, onClose, onSaved, name]);

  useEffect(() => {
    if (!pendingRequestId || connected !== false) return;
    // The in-flight request may never resolve; a retry sends a fresh requestId.
    handledResults.current.add(pendingRequestId);
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

  const conflict = isRevisionConflictMessage(error);
  const dirty = name.trim() !== project.name || description !== (project.description ?? '');

  const save = (revision: number = expectedRevision): void => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Enter a project name.'); return; }
    const patch: { name?: string; description?: string | null } = {};
    if (trimmed !== project.name) patch.name = trimmed;
    if (description !== (project.description ?? '')) patch.description = description || null;
    if (!Object.keys(patch).length || pending) return;
    const requestId = nextRequestId();
    setError(undefined);
    setPendingRequestId(requestId);
    send({ type: 'action:updateProject', requestId, projectId: project.projectId, expectedRevision: revision, patch });
  };

  const reloadCurrent = (): void => {
    setName(project.name);
    setDescription(project.description ?? '');
    setExpectedRevision(project.revision);
    setError(undefined);
  };

  const reapplyDraft = (): void => {
    // Retry against the revision the state push delivered with the conflict.
    setExpectedRevision(project.revision);
    save(project.revision);
  };

  return <Modal open={open} onClose={pending ? (): void => undefined : onClose} width={520}>
    <div role="dialog" aria-label="Edit Project" style={{ padding: 20, display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 400 }}>Edit Project</h2>
      <EditableTextField id="edit-project-name" label="Name" value={name} initialValue={project.name} onChange={setName} disabled={pending} placeholder="Project name (required)" />
      <EditableTextField id="edit-project-description" label="Description" value={description} initialValue={project.description ?? ''} onChange={setDescription} disabled={pending} placeholder="No description" />
      {error && <p role="alert" style={{ margin: 0, color: 'var(--accent-danger)', fontSize: 'var(--text-xs)' }}>{error}{conflict && ' Your draft is preserved; reload current values or reapply it.'}</p>}
      {conflict && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" disabled={pending} onClick={reloadCurrent}>reload current values</Button>
        <Button size="sm" variant="recovery" disabled={pending} onClick={reapplyDraft}>reapply draft</Button>
      </div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button size="sm" disabled={pending} onClick={onClose}>cancelar</Button>
        <Button variant="primary" size="sm" disabled={pending || !dirty || !name.trim()} onClick={() => { save(); }}>{pending ? 'saving…' : 'salvar'}</Button>
      </div>
    </div>
  </Modal>;
}
