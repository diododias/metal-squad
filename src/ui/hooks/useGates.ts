import { useState, useEffect, useCallback } from 'react';
import { openGates, resolveGate, type GateRow, type GateDecision } from '../../db/repo.js';
import { bus } from '../../core/events/bus.js';

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
    bus.on('gate:created', poll);
    bus.on('gate:resolved', poll);
    const id = setInterval(poll, intervalMs);
    return () => {
      bus.off('gate:created', poll);
      bus.off('gate:resolved', poll);
      clearInterval(id);
    };
  }, [intervalMs, poll]);

  const resolve = useCallback<ResolveGateFn>((id, decision) => {
    resolveGate(id, decision);
    poll();
  }, []);

  return { gates, resolve };
}
