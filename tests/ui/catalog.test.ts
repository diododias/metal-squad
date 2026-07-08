import { describe, expect, it } from 'vitest';
import { getPendingFeatures, type FeatureCatalogEntry } from '../../src/ui/catalog.js';

function feature(overrides: Partial<FeatureCatalogEntry>): FeatureCatalogEntry {
  return {
    id: 'feat-1',
    title: 'Feature',
    skills: [],
    tool: 'claude',
    effort: 'medium',
    status: 'todo',
    ...overrides,
  };
}

describe('getPendingFeatures', () => {
  it('excludes features already marked done in the backlog even without run history', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1', status: 'done' }),
      'feat-2': feature({ id: 'feat-2', status: 'todo' }),
    };

    const pending = getPendingFeatures(catalog, new Set());

    expect(pending.map((f) => f.id)).toEqual(['feat-2']);
  });

  it('still excludes features that are active per run history', () => {
    const catalog = {
      'feat-1': feature({ id: 'feat-1', status: 'todo' }),
      'feat-2': feature({ id: 'feat-2', status: 'todo' }),
    };

    const pending = getPendingFeatures(catalog, new Set(['feat-1']));

    expect(pending.map((f) => f.id)).toEqual(['feat-2']);
  });
});
