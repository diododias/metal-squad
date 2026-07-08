import { useState, useEffect, useCallback } from 'react';
import {
  openGates,
  resolveGate,
  forceResolveGate,
  listPendingStageRequests,
  resolveStageRequest,
  type GateRow,
  type GateDecision,
} from '../../db/repo.js';
import { msqEventBus } from '../../core/events/index.js';

export type ApprovalKind = 'gate' | 'stage';

export interface PendingApproval {
  kind: ApprovalKind;
  id: number;
  featureId: string;
  repoId: string;
  prompt: string;
  createdAt: string;
}

export type ResolveApprovalFn = (approval: PendingApproval, decision: GateDecision | 'advance' | 'hold') => void;
export type ForceResolveApprovalFn = (approval: PendingApproval) => { resumedPipelineId: number | null };

function gateToApproval(gate: GateRow): PendingApproval {
  return {
    kind: 'gate',
    id: gate.id,
    featureId: gate.featureId,
    repoId: gate.repoId,
    prompt: '',
    createdAt: gate.createdAt,
  };
}

function collectApprovals(): PendingApproval[] {
  const gates = openGates().map(gateToApproval);
  const stageRequests = listPendingStageRequests().map((sr) => ({
    kind: 'stage' as ApprovalKind,
    id: sr.id,
    featureId: sr.featureId,
    repoId: '',
    prompt: sr.prompt,
    createdAt: sr.createdAt,
  }));
  return [...gates, ...stageRequests];
}

export interface UseGatesResult {
  gates: PendingApproval[];
  resolve: ResolveApprovalFn;
  /** F1: force-bypass a gate. Unlike resolve(), this also resumes the
   * associated pipeline when it is paused/blocked on this gate, so a single
   * action gets a stuck run moving again instead of requiring a separate
   * trip to the run detail screen's resume shortcut. */
  forceResolve: ForceResolveApprovalFn;
}

export function useGates(intervalMs = 2000): UseGatesResult {
  const [gates, setGates] = useState<PendingApproval[]>(() => {
    try {
      return collectApprovals();
    } catch {
      return [];
    }
  });

  const poll = useCallback((): void => {
    try {
      setGates(collectApprovals());
    } catch {
      // DB locked or unavailable — keep stale data
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(poll, intervalMs);

    const unsubscribers = [
      msqEventBus.subscribe('gate:created', poll),
      msqEventBus.subscribe('gate:resolved', poll),
      msqEventBus.subscribe('stage:request-created', poll),
      msqEventBus.subscribe('stage:request-resolved', poll),
      msqEventBus.subscribe('run:start', poll),
      msqEventBus.subscribe('run:done', poll),
      msqEventBus.subscribe('run:failed', poll),
    ];
    return () => {
      clearInterval(timer);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [intervalMs, poll]);

  const resolve = useCallback<ResolveApprovalFn>((approval, decision) => {
    if (approval.kind === 'gate') {
      resolveGate(approval.id, decision as GateDecision);
    } else {
      const response = decision === 'approved' || decision === 'advance' ? 'advance'
        : decision === 'skipped' || decision === 'hold' ? 'hold'
        : 'retry';
      resolveStageRequest(approval.id, response);
    }
    poll();
  }, [poll]);

  const forceResolve = useCallback<ForceResolveApprovalFn>((approval) => {
    if (approval.kind === 'gate') {
      const result = forceResolveGate(approval.id);
      poll();
      return result;
    }
    // Stage approvals already unblock execution as soon as they resolve
    // (the running pipeline polls stage_requests in-process), so "force" is
    // the same effective action as a normal advance for this kind.
    resolveStageRequest(approval.id, 'advance');
    poll();
    return { resumedPipelineId: null };
  }, [poll]);

  return { gates, resolve, forceResolve };
}
