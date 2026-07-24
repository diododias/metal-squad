import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../core/Button.js';
import { EditableTextField } from '../core/EditableTextField.js';
import { Modal } from '../feedback/Modal.js';
import { CONNECTION_LOST_MESSAGE, readActionOutcome } from '../../lib/actionFeedback.js';
import type { WebSocketClientMessage, WebSocketServerMessage } from '../../../types.js';

let sequence = 0;
const nextRequestId = (): string => `epic-${String(Date.now())}-${String(++sequence)}`;

export interface CreateEpicModalProps {
  open: boolean;
  projectId: string;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;
  onClose: () => void;
  /** Fired once after the server confirms the Epic was created. */
  onCreated?: (title: string) => void;
  /** WS connection state; a drop while a request is pending resets the modal
   * out of `creating…` with an actionable error (PF-07). */
  connected?: boolean;
}

/**
 * Modal form behind the `+ New Epic` action on the project detail page.
 * Sends the existing `action:createEpic` and tracks its `action:result` by
 * requestId: success closes the modal, an error keeps it open showing the
 * server message. Opening always starts from a blank draft.
 */
export function CreateEpicModal({ open, projectId, send, actionResults, onClose, onCreated, connected }: CreateEpicModalProps): React.JSX.Element | null {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const handledResults = useRef(new Set<string>());

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setPendingRequestId(null);
    setError(undefined);
    document.getElementById('create-epic-title')?.focus();
  }, [open]);

  useEffect(() => {
    if (!pendingRequestId || handledResults.current.has(pendingRequestId)) return;
    const outcome = readActionOutcome(actionResults[pendingRequestId]);
    if (!outcome) return;
    handledResults.current.add(pendingRequestId);
    setPendingRequestId(null);
    if (outcome.ok) {
      onCreated?.(title.trim());
      onClose();
    } else {
      setError(outcome.message);
    }
  }, [actionResults, pendingRequestId, onClose, onCreated, title]);

  useEffect(() => {
    if (!pendingRequestId || connected !== false) return;
    // The in-flight request may never resolve; leave pending and offer a retry.
    // A retry always sends a fresh requestId — the stale one is ignored.
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

  const createEpic = (): void => {
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    const requestId = nextRequestId();
    setError(undefined);
    setPendingRequestId(requestId);
    send({
      type: 'action:createEpic',
      requestId,
      projectId,
      title: trimmed,
      description: description.trim() ? description.trim() : null,
    });
  };

  return <Modal open={open} onClose={pending ? (): void => undefined : onClose} width={520}>
    <div role="dialog" aria-label="Create Epic" style={{ padding: 20, display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 400 }}>+ New Epic</h2>
      <EditableTextField id="create-epic-title" label="Title" value={title} initialValue="" onChange={setTitle} disabled={pending} placeholder="Epic title (required)" />
      <EditableTextField id="create-epic-description" label="Description" value={description} initialValue="" onChange={setDescription} disabled={pending} placeholder="Optional description" />
      {error && <p role="alert" style={{ margin: 0, color: 'var(--accent-danger)', fontSize: 'var(--text-xs)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button size="sm" disabled={pending} onClick={onClose}>cancel</Button>
        <Button variant="primary" size="sm" disabled={pending || !title.trim()} onClick={createEpic}>{pending ? 'creating…' : 'create'}</Button>
      </div>
    </div>
  </Modal>;
}
