import { describe, expect, it } from 'vitest';
import {
  CANONICAL_FEATURE_ID_RE,
  FEATURE_ID_ALPHABET,
  allocateFeatureId,
  classifyFeatureId,
  generateCanonicalFeatureId,
  registerBacklogFeatures,
  validateExplicitFeatureId,
} from '../../src/core/backlog/featureId.js';
import type { BacklogV2Input } from '../../src/core/backlog/schema.js';

function makeBacklog(features: Array<{ id?: string; title: string }>): BacklogV2Input {
  return {
    version: 2,
    repo: 'demo',
    defaults: { tool: 'claude', effort: 'medium', skills: [], stageSkills: {} },
    epics: [{
      id: 'epic-1',
      title: 'Epic',
      features: features.map((feature) => ({
        ...feature,
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [],
        workflow: {},
      })),
    }],
  };
}

describe('feature ID domain', () => {
  it('uses the canonical alphabet and format', () => {
    const id = generateCanonicalFeatureId(() => 0);
    expect(id).toBe(`F-${FEATURE_ID_ALPHABET[0]?.repeat(8)}`);
    expect(CANONICAL_FEATURE_ID_RE.test(id)).toBe(true);
  });

  it('allocates 200 distinct canonical IDs', () => {
    const occupied = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const id = allocateFeatureId(occupied);
      occupied.add(id);
    }
    expect(occupied).toHaveLength(200);
    expect([...occupied].every((id) => CANONICAL_FEATURE_ID_RE.test(id))).toBe(true);
  });

  it('retries a deterministic collision', () => {
    const occupied = new Set([`F-${FEATURE_ID_ALPHABET[0]?.repeat(8)}`]);
    let calls = 0;
    const id = allocateFeatureId(occupied, () => (calls++ < 8 ? 0 : 1));
    expect(id).toBe(`F-${FEATURE_ID_ALPHABET[1]?.repeat(8)}`);
    expect(calls).toBe(16);
  });

  it('fails explicitly when every candidate remains occupied', () => {
    expect(() => allocateFeatureId(new Set([`F-${FEATURE_ID_ALPHABET[0]?.repeat(8)}`]), () => 0, 2)).toThrow('Unable to allocate a unique feature ID');
  });

  it('classifies canonical, legacy and manual IDs without normalizing them', () => {
    expect(classifyFeatureId('F-23456789')).toBe('generated');
    expect(classifyFeatureId('feat-52')).toBe('legacy');
    expect(classifyFeatureId('Customer-Checkout')).toBe('manual');
    expect(validateExplicitFeatureId('Customer-Checkout')).toBe('manual');
    expect(() => validateExplicitFeatureId('F-abc')).toThrow('reserved F- prefix');
    expect(() => validateExplicitFeatureId(' feat-52')).toThrow('whitespace');
  });

  it('normalizes omitted IDs and rejects duplicate explicit IDs before allocation', () => {
    const result = registerBacklogFeatures(
      makeBacklog([{ title: 'Generated' }, { id: 'feat-52', title: 'Legacy' }]),
      new Set(),
      () => 0,
    );
    expect(result.registrations.map((entry) => [entry.feature.id, entry.assigned, entry.idKind])).toEqual([
      [`F-${FEATURE_ID_ALPHABET[0]?.repeat(8)}`, true, 'generated'],
      ['feat-52', false, 'legacy'],
    ]);
    expect(() => registerBacklogFeatures(makeBacklog([
      { id: 'duplicate', title: 'A' },
      { id: 'duplicate', title: 'B' },
    ]), new Set())).toThrow('Duplicate feature ID');
  });
});
