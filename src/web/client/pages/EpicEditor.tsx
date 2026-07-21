import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../components/core/Button.js';
import { EditableSelectField } from '../components/core/EditableSelectField.js';
import { EditableTextField } from '../components/core/EditableTextField.js';
import { StatusPill } from '../components/core/StatusPill.js';
import { Tag } from '../components/core/Tag.js';
import { isRevisionConflictMessage, readActionOutcome } from '../lib/actionFeedback.js';
import type { EpicRow } from '../../../db/repo.js';
import type { WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';

type EpicActionResult = Extract<WebSocketServerMessage, { type: 'action:result' }>;

interface EpicDraft {
  title: string;
  description: string;
  position: string;
  status: EpicRow['status'];
  expectedRevision: number;
  pendingRequestId?: string;
  error?: string;
}

const manualStatusOptions = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
] as const;

function toDraft(epic: EpicRow): EpicDraft {
  return {
    title: epic.title,
    description: epic.description ?? '',
    position: String(epic.position),
    status: epic.status,
    expectedRevision: epic.revision,
  };
}

function isDirty(draft: EpicDraft, epic: EpicRow): boolean {
  return draft.title !== epic.title
    || draft.description !== (epic.description ?? '')
    || draft.position !== String(epic.position)
    || draft.status !== epic.status;
}

export interface EpicEditorProps {
  epic: EpicRow;
  completedWorkItems: number;
  totalWorkItems: number;
  send: (message: WebSocketClientMessage) => void;
  actionResults: Record<string, EpicActionResult>;
  requestId: (prefix: string) => string;
  /** Fired after a successful save (PF-07 confirmation toast). */
  onSaved?: () => void;
}

/** Editable Epic metadata. Execution state belongs to Work Item runs, so it is
 * deliberately only displayed as derived progress and never written here. */
export function EpicEditor({ epic, completedWorkItems, totalWorkItems, send, actionResults, requestId, onSaved }: EpicEditorProps): React.JSX.Element {
  const [draft, setDraft] = useState<EpicDraft>(() => toDraft(epic));
  const handledResults = useRef(new Set<string>());
  const previousEpic = useRef(epic);

  useEffect(() => {
    if (previousEpic.current.revision === epic.revision) return;
    const prior = previousEpic.current;
    previousEpic.current = epic;
    setDraft((current) => isDirty(current, prior)
      ? { ...current, expectedRevision: epic.revision }
      : toDraft(epic));
  }, [epic]);

  useEffect(() => {
    if (!draft.pendingRequestId) return;
    const result = actionResults[draft.pendingRequestId];
    const outcome = readActionOutcome(result);
    if (!result || !outcome || handledResults.current.has(draft.pendingRequestId)) return;
    handledResults.current.add(draft.pendingRequestId);
    const saved = outcome.ok && 'entity' in outcome.payload && outcome.payload.entity !== null && 'revision' in outcome.payload.entity;
    if (saved) onSaved?.();
    setDraft((current) => {
      if (current.pendingRequestId !== result.payload.requestId) return current;
      if (outcome.ok && 'entity' in outcome.payload && outcome.payload.entity !== null && 'revision' in outcome.payload.entity) {
        return { ...current, expectedRevision: (outcome.payload.entity as { revision: number }).revision, pendingRequestId: undefined, error: undefined };
      }
      return {
        ...current,
        pendingRequestId: undefined,
        error: outcome.ok ? 'Epic update was not acknowledged.' : outcome.message,
      };
    });
  }, [actionResults, draft.pendingRequestId, onSaved]);

  const position = Number(draft.position);
  const positionValid = Number.isInteger(position) && position >= 0;
  const title = draft.title.trim();
  const dirty = isDirty(draft, epic);
  const conflict = isRevisionConflictMessage(draft.error);

  const save = (): void => {
    if (!title) {
      setDraft((current) => ({ ...current, error: 'Enter an Epic title.' }));
      return;
    }
    if (!positionValid) {
      setDraft((current) => ({ ...current, error: 'Position must be a non-negative whole number.' }));
      return;
    }
    const patch: { title?: string; description?: string | null; position?: number; status?: EpicRow['status'] } = {};
    if (title !== epic.title) patch.title = title;
    if (draft.description !== (epic.description ?? '')) patch.description = draft.description || null;
    if (position !== epic.position) patch.position = position;
    if (draft.status !== epic.status) patch.status = draft.status;
    if (!Object.keys(patch).length) return;
    const id = requestId('epic-update');
    setDraft((current) => ({ ...current, pendingRequestId: id, error: undefined }));
    send({ type: 'action:updateEpic', requestId: id, epicId: epic.epicId, expectedRevision: draft.expectedRevision, patch });
  };

  const update = (patch: Partial<EpicDraft>): void => { setDraft((current) => ({ ...current, ...patch, error: undefined })); };

  return <section aria-label={`Edit Epic ${epic.title}`} style={{ display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'start' }}>
      <div style={{ flex: '1 1 260px' }}>
        <EditableTextField id={`epic-${epic.epicId}-title`} label="Title" value={draft.title} initialValue={epic.title} disabled={Boolean(draft.pendingRequestId)} onChange={(value) => { update({ title: value }); }} />
      </div>
      <StatusPill status={draft.status === 'done' ? 'done' : draft.status === 'in_progress' ? 'running' : 'aborted'} label={`manual: ${draft.status}`} spinner={false} />
    </div>
    <EditableTextField id={`epic-${epic.epicId}-description`} label="Description" value={draft.description} initialValue={epic.description ?? ''} disabled={Boolean(draft.pendingRequestId)} placeholder="No description" onChange={(value) => { update({ description: value }); }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
      <EditableTextField id={`epic-${epic.epicId}-position`} label="Position" value={draft.position} initialValue={String(epic.position)} disabled={Boolean(draft.pendingRequestId)} onChange={(value) => { update({ position: value }); }} />
      <EditableSelectField id={`epic-${epic.epicId}-status`} label="Manual status" value={draft.status} initialValue={epic.status} options={manualStatusOptions} disabled={Boolean(draft.pendingRequestId)} onChange={(value) => { update({ status: (value ?? 'todo') as EpicRow['status'] }); }} />
    </div>
    <div style={tags}><Tag>derived progress: {completedWorkItems}/{totalWorkItems}</Tag><Tag>run status does not change manual status</Tag></div>
    {draft.error && <div role="alert" style={errorStyle}>{draft.error}{conflict && ' Your draft is preserved; reload current values or reapply it.'}</div>}
    {conflict && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Button size="sm" onClick={() => { setDraft(toDraft(epic)); }}>reload current values</Button>
      <Button size="sm" variant="recovery" disabled={Boolean(draft.pendingRequestId)} onClick={save}>reapply draft</Button>
    </div>}
    <div><Button variant="primary" size="sm" disabled={!dirty || Boolean(draft.pendingRequestId)} onClick={save}>{draft.pendingRequestId ? 'saving…' : 'save Epic'}</Button></div>
  </section>;
}

const tags: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 };
const errorStyle: React.CSSProperties = { color: 'var(--accent-warn)', fontSize: 'var(--text-xs)' };
