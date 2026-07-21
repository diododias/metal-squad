import type { WebSocketServerMessage } from '../../types.js';

export type ActionResultMessage = Extract<WebSocketServerMessage, { type: 'action:result' }>;

export type ActionOutcome =
  | { ok: true; payload: Extract<ActionResultMessage['payload'], { ok: true }> }
  | { ok: false; message: string; code?: string };

/**
 * Typed read of an `action:result` payload so callers stop hand-casting
 * `(payload as { error: { message: string } })`. Returns `null` while the
 * result has not arrived (request still pending). Failures always carry the
 * server's own message — surfacing it verbatim is the contract (PF-07).
 */
export function readActionOutcome(result: ActionResultMessage | undefined): ActionOutcome | null {
  if (!result) return null;
  if (result.payload.ok) return { ok: true, payload: result.payload };
  return {
    ok: false,
    message: 'error' in result.payload && typeof result.payload.error.message === 'string'
      ? result.payload.error.message
      : 'The server did not acknowledge the action.',
    code: 'error' in result.payload && typeof (result.payload.error as { code?: unknown }).code === 'string'
      ? (result.payload.error as { code: string }).code
      : undefined,
  };
}

/** True when an error message is a revision conflict. Matches the actual
 * RevisionConflictError wording ("… has revision N; expected M") plus the
 * legacy "changed" phrasing older surfaces keyed on. */
export function isRevisionConflictMessage(message: string | undefined): boolean {
  if (!message) return false;
  return message.includes('has revision') || message.includes('changed');
}

/** Error shown when the socket drops while a request is in flight. Retrying is
 * always a new requestId — the stale one is never resent automatically. */
export const CONNECTION_LOST_MESSAGE = 'connection lost — the request may not have reached the server. Retry to send it again.';

/** Toast ids must start with an epoch prefix: ToastStack derives the TTL start
 * from the id's first `-` segment. */
export function toastId(slug: string): string {
  return `${String(Date.now())}-${slug}`;
}
