import { describe, expect, it } from 'vitest';
import { getPendingFeatures, type FeatureCatalogEntry } from '../../src/ui/catalog.js';

function feature(overrides: Partial<FeatureCatalogEntry>): FeatureCatalogEntry {
  return {
    id: 'feat-1',
    title: 'Feature',
    skills: [],
    tool: 'claude',
    effort: 'medium',
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
