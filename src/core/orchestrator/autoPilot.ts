import type { Feature } from '../backlog/schema.js';
import type { AutoPilotAction, AutoPilotOutcomeKind, RunBlockedReason, RunFailedKind } from '../events/types.js';

export interface AutoPilotDecision {
  triggerFeatureId: string;
  triggerRunId: number;
  triggerKind: AutoPilotOutcomeKind;
  action: AutoPilotAction;
  selectedFeatureId?: string;
  reason: string;
}

export function classifySuccessOutcome(): AutoPilotOutcomeKind {
  return 'success';
}

export function classifyBlockedOutcome(reason: RunBlockedReason): AutoPilotOutcomeKind {
  return reason === 'budget' || reason === 'token' ? 'blocked-protective' : 'blocked-human';
}

export function classifyFailedOutcome(kind: RunFailedKind): AutoPilotOutcomeKind {
  return kind === 'aborted' ? 'aborted-manual' : 'failed-execution';
}

/** Only a successfully completed feature may unlock the next detached
 * auto-pilot run. Every other outcome remains with a human for recovery. */
export function shouldEvaluateNextCandidate(kind: AutoPilotOutcomeKind): boolean {
  return kind === 'success';
}

/** Looks up the live (catalog-backed) config for a feature so mid-run edits
 * to `autoStart` apply immediately, matching the existing
 * `workflow.autoAdvance` re-read pattern in execute.ts. */
export interface AutoPilotCandidateLookup {
  getLiveFeature: (featureId: string) => Feature | undefined;
}

/**
 * Selects the next eligible autoStart candidate, preserving the same
 * dependency-respecting order used elsewhere by the scheduler/topo sort.
 * A feature already done or already active is never re-selected.
 */
export function selectNextAutoStartCandidate(
  ordered: Feature[],
  doneFeatureIds: ReadonlySet<string>,
  activeFeatureIds: ReadonlySet<string>,
  lookup: AutoPilotCandidateLookup,
): Feature | undefined {
  for (const feature of ordered) {
    if (doneFeatureIds.has(feature.id)) continue;
    if (activeFeatureIds.has(feature.id)) continue;
    const live = lookup.getLiveFeature(feature.id) ?? feature;
    if (!live.autoStart) continue;
    const dependenciesSatisfied = live.dependsOn.every((dep) => doneFeatureIds.has(dep));
    if (!dependenciesSatisfied) continue;
    return live;
  }
  return undefined;
}

export function buildAutoPilotDecision(params: {
  triggerFeatureId: string;
  triggerRunId: number;
  triggerKind: AutoPilotOutcomeKind;
  selected?: Feature;
}): AutoPilotDecision {
  const { triggerFeatureId, triggerRunId, triggerKind, selected } = params;

  if (triggerKind !== 'success') {
    return {
      triggerFeatureId,
      triggerRunId,
      triggerKind,
      action: 'stop',
      reason: 'Auto-pilot stopped: the previous feature did not complete successfully. Manual intervention required.',
    };
  }

  if (!selected) {
    return {
      triggerFeatureId,
      triggerRunId,
      triggerKind,
      action: 'idle',
      reason: 'No eligible autoStart feature is ready to run.',
    };
  }

  return {
    triggerFeatureId,
    triggerRunId,
    triggerKind,
    action: 'start',
    selectedFeatureId: selected.id,
    reason: `Starting next eligible autoStart feature: ${selected.id}.`,
  };
}
