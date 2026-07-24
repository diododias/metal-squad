import React, { useEffect, useRef, useState } from 'react';
import type { WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';
import { readActionOutcome, toastId } from '../lib/actionFeedback.js';
import { Button } from './core/Button.js';
import type { ToastStackItem } from './feedback/ToastStack.js';

type ActionResults = Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;

let sequence = 0;
function nextRequestId(): string {
  sequence += 1;
  return `epic-approve-${String(Date.now())}-${String(sequence)}`;
}

/** Human approval is intentionally separate from lifecycle verbs: it is the
 * single server-validated transition from the derived review state to done. */
export function EpicApprovalAction({ epicId, revision, status, send, actionResults, onToast }: {
  epicId: string;
  revision: number;
  status: string;
  send: (message: WebSocketClientMessage) => void;
  actionResults: ActionResults;
  onToast?: (item: ToastStackItem) => void;
}): React.JSX.Element | null {
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (!pendingRequestId || handled.current.has(pendingRequestId)) return;
    const outcome = readActionOutcome(actionResults[pendingRequestId]);
    if (!outcome) return;
    handled.current.add(pendingRequestId);
    setPendingRequestId(null);
    if (outcome.ok) {
      setError(null);
      onToast?.({ id: toastId('epic-approved'), tone: 'ok', message: 'Epic approved and marked done.', source: 'Epics' });
    } else {
      setError(outcome.message);
    }
  }, [actionResults, onToast, pendingRequestId]);

  if (status !== 'in_review') return null;

  return <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <Button
      variant="primary"
      size="sm"
      disabled={pendingRequestId !== null}
      onClick={() => {
        const requestId = nextRequestId();
        setPendingRequestId(requestId);
        setError(null);
        send({ type: 'action:approveEpic', requestId, epicId, expectedRevision: revision });
      }}
    >
      {pendingRequestId ? 'Approving…' : 'Approve'}
    </Button>
    {error ? <span role="alert" style={{ color: 'var(--status-failed, #f87171)', fontSize: 'var(--text-2xs)' }}>{error}</span> : null}
  </div>;
}
