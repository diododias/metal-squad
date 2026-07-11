import { describe, it, expect, vi, afterEach } from 'vitest';
import { collectBacklogSkillNames } from '../../src/core/skills/backlog.js';
import type { BacklogV2 } from '../../src/core/backlog/schema.js';

function makeBacklog(overrides: Partial<BacklogV2> = {}): BacklogV2 {
  return {
    version: 2,
    repo: 'test-repo',
    defaults: { tool: 'claude', effort: 'medium', skills: [], stageSkills: {} },
    epics: [],
    ...overrides,
  };
}

describe('collectBacklogSkillNames', () => {
  it('returns empty array when no skills anywhere', () => {
    const backlog = makeBacklog();
    expect(collectBacklogSkillNames(backlog)).toEqual([]);
  });

  it('includes default skills', () => {
    const backlog = makeBacklog({
      defaults: { tool: 'claude', effort: 'medium', skills: ['implement', 'test'] },
    });
    const names = collectBacklogSkillNames(backlog);
    expect(names).toContain('implement');
    expect(names).toContain('test');
  });

  it('includes feature-level skills', () => {
    const backlog = makeBacklog({
      epics: [{
        id: 'epic-1',
        title: 'Epic',
        features: [{
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          skills: ['review'],
          dependsOn: [],
          tasks: [],
        }],
      }],
    });
    const names = collectBacklogSkillNames(backlog);
    expect(names).toContain('review');
  });

  it('includes task-level skills', () => {
    const backlog = makeBacklog({
      epics: [{
        id: 'epic-1',
        title: 'Epic',
        features: [{
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          dependsOn: [],
          tasks: [{
            id: 'task-1',
            title: 'Task',
            skills: ['decompose'],
            dependsOn: [],
            status: 'todo',
          }],
        }],
      }],
    });
    const names = collectBacklogSkillNames(backlog);
    expect(names).toContain('decompose');
  });

  it('maps built-in workflow stages to their configured skills', () => {
    const backlog = makeBacklog({
      epics: [{
        id: 'epic-1',
        title: 'Epic',
        features: [{
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          dependsOn: [],
          workflow: { stages: ['specify', 'implement', 'validate'] },
          tasks: [],
        }],
      }],
    });
    const names = collectBacklogSkillNames(backlog);
    expect(names).toContain('speckit-specify');
    expect(names).toContain('speckit-implement');
    expect(names).toContain('dev-flow');
    expect(names).toContain('review');
    expect(names).not.toContain('validate');
  });

  it('falls back to the stage name when no stage mapping exists', () => {
    const backlog = makeBacklog({
      epics: [{
        id: 'epic-1',
        title: 'Epic',
        features: [{
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          dependsOn: [],
          workflow: { stages: ['analyze', 'implement'] },
          tasks: [],
        }],
      }],
    });
    const names = collectBacklogSkillNames(backlog);
    expect(names).toContain('analyze');
    expect(names).toContain('speckit-implement');
    expect(names).toContain('dev-flow');
  });

  it('deduplicates skill names across all sources', () => {
    const backlog = makeBacklog({
      defaults: { tool: 'claude', effort: 'medium', skills: ['implement'] },
      epics: [{
        id: 'epic-1',
        title: 'Epic',
        features: [{
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          skills: ['implement', 'review'],
          dependsOn: [],
          tasks: [{
            id: 'task-1',
            title: 'Task',
            skills: ['implement'],
            dependsOn: [],
            status: 'todo',
          }],
        }],
      }],
    });
    const names = collectBacklogSkillNames(backlog);
    expect(names.filter((n) => n === 'implement')).toHaveLength(1);
    expect(names).toContain('review');
  });

  it('handles features with no skills', () => {
    const backlog = makeBacklog({
      epics: [{
        id: 'epic-1',
        title: 'Epic',
        features: [{
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          dependsOn: [],
          tasks: [],
        }],
      }],
    });
    expect(collectBacklogSkillNames(backlog)).toEqual([]);
  });

  it('handles null/undefined skills gracefully', () => {
    const backlog = makeBacklog({
      defaults: { tool: 'claude', effort: 'medium', skills: undefined },
    });
    // Should not throw
    expect(() => collectBacklogSkillNames(backlog)).not.toThrow();
  });
});

describe('validateBacklogSkills via doMock', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('throws when skills are missing from registry', async () => {
    vi.doMock('../../src/core/skills/registry.js', () => ({
      createSkillRegistry: vi.fn(() => ({
        discover: vi.fn(() => []),
        resolve: vi.fn(() => []),
        validate: vi.fn(() => ({ valid: false, missing: ['unknown-skill'] })),
      })),
    }));

    const { validateBacklogSkills } = await import('../../src/core/skills/backlog.js');
    const backlog = makeBacklog({
      defaults: { tool: 'claude', effort: 'medium', skills: ['unknown-skill'] },
    });

    expect(() => validateBacklogSkills(backlog, '/cwd')).toThrow(
      /Missing skills referenced in backlog: unknown-skill/,
    );
  });

  it('does not throw when all skills are valid', async () => {
    vi.doMock('../../src/core/skills/registry.js', () => ({
      createSkillRegistry: vi.fn(() => ({
        discover: vi.fn(() => []),
        resolve: vi.fn(() => []),
        validate: vi.fn(() => ({ valid: true, missing: [] })),
      })),
    }));

    const { validateBacklogSkills } = await import('../../src/core/skills/backlog.js');
    const backlog = makeBacklog({
      defaults: { tool: 'claude', effort: 'medium', skills: ['implement'] },
    });

    expect(() => validateBacklogSkills(backlog, '/cwd')).not.toThrow();
  });
});
