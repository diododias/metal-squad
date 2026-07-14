import { describe, expect, it } from 'vitest';
import { selectFeaturePlan, selectStartableFeaturePlan } from '../../src/core/orchestrator/graph.js';
import type { BacklogV2 } from '../../src/core/backlog/schema.js';

const backlog: BacklogV2 = {
  version: 2,
  repo: 'metal-squad',
  defaults: {
    tool: 'claude',
    effort: 'medium',
    skills: ['implement'],
  },
  epics: [
    {
      id: 'epic-1',
      title: 'Epic',
      features: [
        {
          id: 'feat-01',
          title: 'Base',
          tool: 'claude',
          effort: 'medium',
          dependsOn: [],
          tasks: [],
        },
        {
          id: 'feat-02',
          title: 'Intermediate',
          tool: 'claude',
          effort: 'medium',
          dependsOn: ['feat-01'],
          tasks: [],
        },
        {
          id: 'feat-03',
          title: 'Target',
          tool: 'claude',
          effort: 'medium',
          dependsOn: ['feat-02'],
          tasks: [],
        },
      ],
    },
  ],
};

describe('selectFeaturePlan', () => {
  it('includes the target feature and its transitive dependencies', () => {
    const plan = selectFeaturePlan(backlog, 'feat-03');
    expect(plan.map((feature) => feature.id)).toEqual(['feat-01', 'feat-02', 'feat-03']);
  });

  it('throws when the target feature does not exist', () => {
    expect(() => selectFeaturePlan(backlog, 'feat-99')).toThrow(
      'Feature not found in backlog: feat-99',
    );
  });

  it('throws when a dependency is missing from the backlog', () => {
    const brokenBacklog: BacklogV2 = {
      ...backlog,
      epics: [
        {
          ...backlog.epics[0]!,
          features: [
            {
              id: 'feat-03',
              title: 'Target',
              tool: 'claude',
              effort: 'medium',
              dependsOn: ['feat-02'],
              tasks: [],
            },
          ],
        },
      ],
    };

    expect(() => selectFeaturePlan(brokenBacklog, 'feat-03')).toThrow(
      'Feature feat-03 depends on missing feature feat-02',
    );
  });
});

describe('selectStartableFeaturePlan', () => {
  it('returns only the target when all dependencies are already completed', () => {
    const plan = selectStartableFeaturePlan(backlog, 'feat-03', new Set(['feat-01', 'feat-02']));
    expect(plan.target.id).toBe('feat-03');
    expect(plan.pendingDependencies).toEqual([]);
    expect(plan.completedDependencies).toEqual(['feat-01', 'feat-02']);
  });

  it('reports pending dependencies instead of scheduling them implicitly', () => {
    const plan = selectStartableFeaturePlan(backlog, 'feat-03', new Set(['feat-01']));
    expect(plan.target.id).toBe('feat-03');
    expect(plan.pendingDependencies).toEqual(['feat-02']);
    expect(plan.completedDependencies).toEqual(['feat-01']);
  });
});
