import { useState, useEffect, useCallback } from 'react';
import {
  openGates,
  resolveGate,
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

export function useGates(intervalMs = 2000): { gates: PendingApproval[]; resolve: ResolveApprovalFn } {
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

  return { gates, resolve };
}
