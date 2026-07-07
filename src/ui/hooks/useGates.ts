import { useState, useEffect, useCallback } from 'react';
import { openGates, resolveGate, type GateRow, type GateDecision } from '../../db/repo.js';
import { msqEventBus } from '../../core/events/index.js';

export type ResolveGateFn = (id: number, decision: GateDecision) => void;

export function useGates(intervalMs = 2000): { gates: GateRow[]; resolve: ResolveGateFn } {
  const [gates, setGates] = useState<GateRow[]>(() => {
    try {
      return openGates();
    } catch {
      return [];
    }
  });

  const poll = useCallback((): void => {
    try {
      setGates(openGates());
    } catch {
      // DB locked or unavailable — keep stale data
    }
  }, []);

  useEffect(() => {
    void intervalMs;

    const unsubscribers = [
      msqEventBus.subscribe('gate:created', poll),
      msqEventBus.subscribe('gate:resolved', poll),
      msqEventBus.subscribe('run:start', poll),
      msqEventBus.subscribe('run:done', poll),
      msqEventBus.subscribe('run:failed', poll),
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [intervalMs, poll]);

  const resolve = useCallback<ResolveGateFn>((id, decision) => {
    resolveGate(id, decision);
    poll();
  }, [poll]);

  return { gates, resolve };
}
