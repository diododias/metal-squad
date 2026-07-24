import React from 'react';
import type { AllowedLifecycle, WebSocketClientMessage, WebSocketServerMessage } from '../../types.js';
import type { PillStatus } from './core/StatusPill.js';
import { Button } from './core/Button.js';
import type { ToastStackItem } from './feedback/ToastStack.js';
import { LifecycleActions } from './LifecycleActions.js';
import type { StartEligibility } from '../lib/startEligibility.js';

type ActionResults = Record<string, Extract<WebSocketServerMessage, { type: 'action:result' }>>;

export interface WorkItemActionsProps {
  id: string;
  name: string;
  revision: number;
  allowed: AllowedLifecycle | undefined;
  eligibility: StartEligibility;
  pill: PillStatus;
  pipelineId: number | null | undefined;
  send: (message: WebSocketClientMessage) => void;
  actionResults: ActionResults;
  onStart: () => void;
  startLabel?: string;
  startTitle?: string;
  onRequestCancel?: () => void;
  size?: 'sm' | 'md';
  onToast?: (item: ToastStackItem) => void;
}

/**
 * The single contextual action contract for a Work Item. Lifecycle permissions
 * stay server-derived; this component only combines them with the existing
 * client-side start gate and the visual pipeline state.
 */
export function WorkItemActions({
  id, name, revision, allowed, eligibility, pill, pipelineId, send, actionResults,
  onStart, startLabel = 'Start', startTitle, onRequestCancel, size = 'sm', onToast,
}: WorkItemActionsProps): React.JSX.Element | null {
  const canResume = pill === 'blocked' && pipelineId != null;
  const canAbort = (pill === 'running' || pill === 'blocked') && pipelineId != null;
  const canStart = pill === 'not_started';

  if (!canStart && !canResume && !canAbort && !allowed) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {canStart && (
        <Button
          variant="primary"
          size={size}
          disabled={!eligibility.canStart}
          title={eligibility.reason ?? startTitle ?? `Start "${name}"`}
          onClick={onStart}
        >
          {startLabel}
        </Button>
      )}
      {canResume && (
        <Button variant="ok" size={size} onClick={() => { send({ type: 'action:resumePipeline', pipelineId }); }}>
          Resume
        </Button>
      )}
      {canAbort && (
        <Button variant="destructive" size={size} onClick={() => { send({ type: 'action:abortPipeline', pipelineId }); }}>
          Abort
        </Button>
      )}
      <LifecycleActions
        kind="work_item"
        id={id}
        name={name}
        revision={revision}
        allowed={allowed}
        send={send}
        actionResults={actionResults}
        onRequestCancel={onRequestCancel}
        size={size}
        onToast={onToast}
      />
    </div>
  );
}
