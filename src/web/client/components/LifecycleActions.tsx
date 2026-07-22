import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AllowedLifecycle, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';
import { readActionOutcome, toastId } from '../lib/actionFeedback.js';
import { Button } from './core/Button.js';
import { Tag } from './core/Tag.js';
import type { ToastStackItem } from './feedback/ToastStack.js';
import { Modal } from './feedback/Modal.js';

export type LifecycleEntityKind = 'project' | 'epic' | 'work_item';

/** Action results funnel through the shared `action:result` channel keyed by
 * requestId (see App.tsx). */
type ActionResults = Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;

export interface LifecycleActionsProps {
  kind: LifecycleEntityKind;
  /** Entity id: projectId / epicId / workItemId. */
  id: string;
  /** Display name used by the typed-confirmation delete (Project/Epic). */
  name: string;
  /** Current row revision — sent as `expectedRevision` for optimistic concurrency. */
  revision: number;
  /** Policy-permitted actions computed server-side (PRJ-17/PRJ-18). May be
   * absent while the first snapshot is loading. */
  allowed: AllowedLifecycle | undefined;
  send: (message: WebSocketClientMessage) => void;
  actionResults: ActionResults;
  /** Running entities offer "Cancel" first: the host surface owns the abort
   * plumbing (pipelineId/featureId) and wires it here. Absent means the surface
   * cannot cancel from here — only the blocked reason is shown. */
  onRequestCancel?: () => void;
  size?: 'sm' | 'md';
  /** Confirmation toast on successful archive/restore/delete (PF-07). */
  onToast?: (item: ToastStackItem) => void;
}

function nextRequestId(prefix: string): string {
  return `${prefix}-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The archive/restore/delete WS message type for a given kind and verb. */
function messageType(kind: LifecycleEntityKind, verb: 'archive' | 'delete' | 'restoreArchived'): WebSocketClientMessage['type'] {
  switch (kind) {
    case 'project': return `action:${verb}Project` as WebSocketClientMessage['type'];
    case 'epic': return `action:${verb}Epic` as WebSocketClientMessage['type'];
    case 'work_item': return `action:${verb}WorkItem` as WebSocketClientMessage['type'];
  }
}

/** The id field name each entity family expects in its lifecycle message. */
function idField(kind: LifecycleEntityKind): 'projectId' | 'epicId' | 'workItemId' {
  return kind === 'project' ? 'projectId' : kind === 'epic' ? 'epicId' : 'workItemId';
}

/**
 * Renders the lifecycle actions the server policy permits for a single entity
 * (PRJ-18). The client never recomputes the rules: it enables/disables buttons
 * from `allowed`. Delete requires confirmation — typed (name) for Project/Epic,
 * explicit for Work Item. A running entity offers Cancel first and explains why
 * lifecycle is blocked. Archive (reversible) and Delete (tombstone) are visually
 * distinguished via a Tag.
 */
export function LifecycleActions({
  kind, id, name, revision, allowed, send, actionResults, onRequestCancel, size = 'sm', onToast,
}: LifecycleActionsProps): React.JSX.Element | null {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const handled = useRef<Set<string>>(new Set());
  const pendingVerbs = useRef<Map<string, 'archive' | 'delete' | 'restoreArchived'>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Surface the policy/concurrency error at the point of origin and let the next
  // snapshot's `allowed` reconcile the buttons. Resolved in an effect (never
  // during render) so the reducer stays free of side effects.
  useEffect(() => {
    if (!pendingRequestId || handled.current.has(pendingRequestId)) return;
    const outcome = readActionOutcome(actionResults[pendingRequestId]);
    if (!outcome) return;
    handled.current.add(pendingRequestId);
    const verb = pendingVerbs.current.get(pendingRequestId);
    pendingVerbs.current.delete(pendingRequestId);
    setPendingRequestId(null);
    if (outcome.ok) {
      setError(null);
      setConfirmOpen(false);
      setTyped('');
      if (verb) {
        const entityLabel = kind === 'project' ? 'Project' : kind === 'epic' ? 'Epic' : 'Work Item';
        const verbLabel = verb === 'archive' ? 'archived' : verb === 'delete' ? 'deleted' : 'restored';
        onToast?.({ id: toastId(`lifecycle-${verb}`), tone: 'ok', message: `${entityLabel} "${name}" ${verbLabel}.`, source: 'Lifecycle' });
      }
    } else {
      setError(outcome.message);
    }
  }, [actionResults, pendingRequestId, kind, name, onToast]);

  const requiresTypedConfirm = kind === 'project' || kind === 'epic';

  const dispatch = useMemo(() => (verb: 'archive' | 'delete' | 'restoreArchived'): void => {
    const requestId = nextRequestId(`lifecycle-${verb}`);
    pendingVerbs.current.set(requestId, verb);
    setPendingRequestId(requestId);
    setError(null);
    send({ type: messageType(kind, verb), requestId, [idField(kind)]: id, expectedRevision: revision } as unknown as WebSocketClientMessage);
  }, [kind, id, revision, send]);

  if (!allowed) return null;

  // Tombstoned entities offer nothing through the common flow.
  if (allowed.deleted) {
    return <Tag tone="default">Deleted</Tag>;
  }

  const cancelConfirm = (): void => { setConfirmOpen(false); setTyped(''); setError(null); };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {allowed.cancel ? (
        <>
          {onRequestCancel ? (
            <Button variant="pause" size={size} onClick={onRequestCancel}>Cancel</Button>
          ) : null}
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-2xs)' }}>
            {allowed.blockedReason ?? 'Running.'}
          </span>
        </>
      ) : null}

      {allowed.archive ? (
        <Button variant="neutral" size={size} onClick={() => { dispatch('archive'); }} title="Archive is reversible">
          Archive
        </Button>
      ) : null}

      {allowed.restore ? (
        <Button variant="recovery" size={size} onClick={() => { dispatch('restoreArchived'); }}>
          Restore
        </Button>
      ) : null}

      {allowed.delete ? (
        <Button variant="destructive" size={size} onClick={() => { setConfirmOpen(true); setTyped(''); setError(null); }}>
          Delete
        </Button>
      ) : null}

      {/* Whenever delete is refused and the entity is not running (running is
          already explained next to Cancel), say why — including the common
          "has history → archive only" case, where Archive is still offered. */}
      {!allowed.cancel && !allowed.delete && allowed.blockedReason ? (
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-2xs)' }}>{allowed.blockedReason}</span>
      ) : null}

      {error ? (
        <span role="alert" style={{ color: 'var(--status-failed, #f87171)', fontSize: 'var(--text-2xs)' }}>{error}</span>
      ) : null}

      <Modal open={confirmOpen} onClose={cancelConfirm} width={460}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag tone="accent">Delete</Tag>
            <strong style={{ fontSize: 'var(--text-sm)' }}>Delete {name}?</strong>
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
            This is a logical delete (tombstone) and is not restorable through the common flow.
          </p>
          {requiresTypedConfirm ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-xs)' }}>
              Type <code>{name}</code> to confirm:
              <input
                value={typed}
                onChange={(e) => { setTyped(e.target.value); }}
                aria-label="confirm-delete-name"
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', padding: '6px 8px',
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-sm)',
                }}
              />
            </label>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--text-xs)' }}>Confirm you want to permanently delete this Work Item.</p>
          )}
          {error ? (
            <span role="alert" style={{ color: 'var(--status-failed, #f87171)', fontSize: 'var(--text-2xs)' }}>{error}</span>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="neutral" size="sm" onClick={cancelConfirm}>Cancel</Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={requiresTypedConfirm && typed !== name}
              onClick={() => { dispatch('delete'); }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
