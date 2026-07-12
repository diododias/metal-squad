import { describe, expect, it } from 'vitest';
import { getPendingFeatures, type FeatureCatalogEntry } from '../../src/ui/catalog.js';

function feature(overrides: Partial<FeatureCatalogEntry>): FeatureCatalogEntry {
  return {
    id: 'feat-1',
    title: 'Feature',
    skills: [],
    tool: 'claude',
    effort: 'medium',
    dependsOn: [],
    workflow: { mode: 'staged', stages: ['specify'], approvals: { channel: 'telegram', autoAdvance: false }, syncTasksToBacklog: true, sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] } },
    autoStart: false,
    ...overrides,
  };
}

describe('getPendingFeatures', () => {
  it('excludes features already completed per SQLite pipeline history', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1' }),
      'feat-2': feature({ id: 'feat-2' }),
    };

    const pending = getPendingFeatures(catalog, new Set(['feat-1']), new Set());

    expect(pending.map((f) => f.id)).toEqual(['feat-2']);
  });

  it('still excludes features that are active per run history', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1' }),
      'feat-2': feature({ id: 'feat-2' }),
    };

    const pending = getPendingFeatures(catalog, new Set(), new Set(['feat-1']));

    expect(pending.map((f) => f.id)).toEqual(['feat-2']);
  });
});

describe('autoStart projection', () => {
  it('defaults to false when not specified', () => {
    const f = feature({ id: 'feat-1' });
    expect(f.autoStart).toBe(false);
  });

  it('preserves true when specified', () => {
    const f = feature({ id: 'feat-1', autoStart: true });
    expect(f.autoStart).toBe(true);
  });

  it('includes autoStart in pending features', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1', autoStart: true }),
      'feat-2': feature({ id: 'feat-2', autoStart: false }),
    };

    const pending = getPendingFeatures(catalog, new Set(), new Set());

    expect(pending).toHaveLength(2);
    expect(pending.find((f) => f.id === 'feat-1')?.autoStart).toBe(true);
    expect(pending.find((f) => f.id === 'feat-2')?.autoStart).toBe(false);
  });
});
