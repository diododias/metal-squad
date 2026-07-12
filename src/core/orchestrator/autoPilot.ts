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

/** Outcomes that qualify for auto-pilot to evaluate a next candidate at all
 * (as opposed to `blocked-protective`, which is a hard stop, and
 * `aborted-manual`, which waits for human-initiated recovery). */
export function shouldEvaluateNextCandidate(kind: AutoPilotOutcomeKind): boolean {
  return kind === 'success' || kind === 'blocked-human' || kind === 'failed-execution';
}

/** Looks up the live (catalog-backed) config for a feature so mid-run edits
 * to `autoStart` apply immediately, matching the existing
 * `workflow.approvals.autoAdvance` re-read pattern in execute.ts. */
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

  if (triggerKind === 'blocked-protective') {
    return {
      triggerFeatureId,
      triggerRunId,
      triggerKind,
      action: 'stop',
      reason: 'Protective stop: budget or token limit reached. Manual intervention required.',
    };
  }

  if (triggerKind === 'aborted-manual') {
    return {
      triggerFeatureId,
      triggerRunId,
      triggerKind,
      action: 'idle',
      reason: 'Run was manually aborted; auto-pilot does not continue automatically.',
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
