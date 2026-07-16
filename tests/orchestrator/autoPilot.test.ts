import { describe, expect, it } from 'vitest';
import {
  buildAutoPilotDecision,
  classifyBlockedOutcome,
  classifyFailedOutcome,
  classifySuccessOutcome,
  selectNextAutoStartCandidate,
  shouldEvaluateNextCandidate,
} from '../../src/core/orchestrator/autoPilot.js';
import type { Feature } from '../../src/core/backlog/schema.js';

function feature(id: string, overrides: Partial<Feature> = {}): Feature {
  return {
    id,
    title: id,
    tool: 'claude',
    effort: 'medium',
    dependsOn: [],
    tasks: [],
    autoStart: false,
    ...overrides,
  } as Feature;
}

describe('classifySuccessOutcome', () => {
  it('always classifies as success', () => {
    expect(classifySuccessOutcome()).toBe('success');
  });
});

describe('classifyBlockedOutcome', () => {
  it('classifies needs_input as blocked-human', () => {
    expect(classifyBlockedOutcome('needs_input')).toBe('blocked-human');
  });

  it('classifies gate as blocked-human', () => {
    expect(classifyBlockedOutcome('gate')).toBe('blocked-human');
  });

  it('classifies budget as blocked-protective', () => {
    expect(classifyBlockedOutcome('budget')).toBe('blocked-protective');
  });

  it('classifies token as blocked-protective', () => {
    expect(classifyBlockedOutcome('token')).toBe('blocked-protective');
  });
});

describe('classifyFailedOutcome', () => {
  it('classifies execution as failed-execution', () => {
    expect(classifyFailedOutcome('execution')).toBe('failed-execution');
  });

  it('classifies aborted as aborted-manual', () => {
    expect(classifyFailedOutcome('aborted')).toBe('aborted-manual');
  });
});

describe('shouldEvaluateNextCandidate', () => {
  it('qualifies only success', () => {
    expect(shouldEvaluateNextCandidate('success')).toBe(true);
    expect(shouldEvaluateNextCandidate('blocked-human')).toBe(false);
    expect(shouldEvaluateNextCandidate('failed-execution')).toBe(false);
    expect(shouldEvaluateNextCandidate('blocked-protective')).toBe(false);
    expect(shouldEvaluateNextCandidate('aborted-manual')).toBe(false);
  });
});

describe('selectNextAutoStartCandidate', () => {
  it('selects the next dependency-free autoStart feature in deterministic order', () => {
    const ordered = [
      feature('feat-01', { autoStart: true }),
      feature('feat-02', { autoStart: true }),
    ];
    const selected = selectNextAutoStartCandidate(ordered, new Set(), new Set(), {
      getLiveFeature: (id) => ordered.find((f) => f.id === id),
    });
    expect(selected?.id).toBe('feat-01');
  });

  it('excludes features without autoStart', () => {
    const ordered = [
      feature('feat-01', { autoStart: false }),
      feature('feat-02', { autoStart: true }),
    ];
    const selected = selectNextAutoStartCandidate(ordered, new Set(), new Set(), {
      getLiveFeature: (id) => ordered.find((f) => f.id === id),
    });
    expect(selected?.id).toBe('feat-02');
  });

  it('excludes already-done features', () => {
    const ordered = [feature('feat-01', { autoStart: true }), feature('feat-02', { autoStart: true })];
    const selected = selectNextAutoStartCandidate(ordered, new Set(['feat-01']), new Set(), {
      getLiveFeature: (id) => ordered.find((f) => f.id === id),
    });
    expect(selected?.id).toBe('feat-02');
  });

  it('excludes already-active features', () => {
    const ordered = [feature('feat-01', { autoStart: true }), feature('feat-02', { autoStart: true })];
    const selected = selectNextAutoStartCandidate(ordered, new Set(), new Set(['feat-01']), {
      getLiveFeature: (id) => ordered.find((f) => f.id === id),
    });
    expect(selected?.id).toBe('feat-02');
  });

  it('excludes features whose dependencies are not satisfied', () => {
    const ordered = [feature('feat-01', { autoStart: true, dependsOn: ['feat-00'] })];
    const selected = selectNextAutoStartCandidate(ordered, new Set(), new Set(), {
      getLiveFeature: (id) => ordered.find((f) => f.id === id),
    });
    expect(selected).toBeUndefined();
  });

  it('re-reads live catalog config so a mid-run autoStart edit applies immediately', () => {
    const stale = feature('feat-01', { autoStart: false });
    const live = feature('feat-01', { autoStart: true });
    const selected = selectNextAutoStartCandidate([stale], new Set(), new Set(), {
      getLiveFeature: () => live,
    });
    expect(selected?.id).toBe('feat-01');
  });

  it('returns undefined when no candidate is eligible', () => {
    const ordered = [feature('feat-01', { autoStart: false })];
    const selected = selectNextAutoStartCandidate(ordered, new Set(), new Set(), {
      getLiveFeature: (id) => ordered.find((f) => f.id === id),
    });
    expect(selected).toBeUndefined();
  });
});

describe('buildAutoPilotDecision', () => {
  it('returns action=start with the selected feature id', () => {
    const decision = buildAutoPilotDecision({
      triggerFeatureId: 'feat-01',
      triggerRunId: 7,
      triggerKind: 'success',
      selected: feature('feat-02', { autoStart: true }),
    });
    expect(decision).toMatchObject({ action: 'start', selectedFeatureId: 'feat-02' });
  });

  it('returns action=idle when no candidate is eligible', () => {
    const decision = buildAutoPilotDecision({
      triggerFeatureId: 'feat-01',
      triggerRunId: 7,
      triggerKind: 'success',
    });
    expect(decision).toMatchObject({ action: 'idle' });
    expect(decision.selectedFeatureId).toBeUndefined();
  });

  it('returns action=stop for blocked-protective regardless of a selected candidate', () => {
    const decision = buildAutoPilotDecision({
      triggerFeatureId: 'feat-01',
      triggerRunId: 7,
      triggerKind: 'blocked-protective',
      selected: feature('feat-02', { autoStart: true }),
    });
    expect(decision).toMatchObject({ action: 'stop' });
    expect(decision.selectedFeatureId).toBeUndefined();
  });

  it('returns action=stop for failed execution regardless of a selected candidate', () => {
    const decision = buildAutoPilotDecision({
      triggerFeatureId: 'feat-01',
      triggerRunId: 7,
      triggerKind: 'failed-execution',
      selected: feature('feat-02', { autoStart: true }),
    });
    expect(decision).toMatchObject({ action: 'stop' });
    expect(decision.selectedFeatureId).toBeUndefined();
    expect(decision.reason).toContain('Manual intervention required');
  });

  it('returns action=stop for an aborted run', () => {
    const decision = buildAutoPilotDecision({
      triggerFeatureId: 'feat-01',
      triggerRunId: 7,
      triggerKind: 'aborted-manual',
    });
    expect(decision).toMatchObject({ action: 'stop' });
  });
});
