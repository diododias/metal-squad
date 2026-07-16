import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFileSync = vi.fn();
const mockExistsSync = vi.fn();
const mockParse = vi.fn();
const mockBacklogSchemaParse = vi.fn();
const mockBacklogV2SchemaParse = vi.fn((value: unknown) => value);
const mockLoadRepoConfig = vi.fn(() => ({ defaults: {} }));

vi.mock('node:fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
}));
vi.mock('yaml', () => ({ parse: mockParse, stringify: vi.fn() }));
vi.mock('../../src/config/index.js', () => ({
  loadRepoConfig: mockLoadRepoConfig,
  mergeStageSkills: (base: Record<string, string[]> = {}, overlay: Record<string, string[]> = {}) => ({ ...base, ...overlay }),
}));
vi.mock('../../src/core/backlog/schema.js', () => ({
  BacklogSchema: { parse: mockBacklogSchemaParse },
  BacklogInputSchema: { parse: mockBacklogSchemaParse },
  BacklogV2Schema: { parse: mockBacklogV2SchemaParse },
}));

beforeEach(() => {
  vi.resetModules();
  mockReadFileSync.mockReset();
  mockExistsSync.mockReset().mockReturnValue(true); // default: files exist
  mockParse.mockReset();
  mockBacklogSchemaParse.mockReset();
  mockBacklogV2SchemaParse.mockClear();
});

// Helper to make a minimal V2 backlog parsed result
function makeV2Backlog(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    repo: 'my-repo',
    defaults: {
      tool: 'claude',
      effort: 'medium',
      thinking: 'off',
      skills: [],
      stageSkills: {},
      workflow: {
        mode: 'staged',
        stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
        approvals: { channel: 'telegram', autoAdvance: false },
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
        stepGuidance: {},
      },
    },
    epics: [],
    ...overrides,
  };
}

// Helper to build the raw YAML object that goes through applyDefaultsBeforeParse
function makeRawV2(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    repo: 'test',
    defaults: { tool: 'codex', effort: 'high', skills: ['implement'] },
    epics: [],
    ...overrides,
  };
}

describe('loadBacklog — version 2 default propagation', () => {
  it('propagates defaults.tool to feature when feature.tool is undefined', async () => {
    const rawV2 = makeRawV2({
      epics: [{
        id: 'e1', title: 'Epic', features: [{
          id: 'feat-1', title: 'F', tool: undefined, effort: undefined, skills: undefined,
          tasks: [], dependsOn: [],
        }],
      }],
    });
    mockParse.mockReturnValue(rawV2);

    const parsedResult = makeV2Backlog({
      defaults: {
        tool: 'codex',
        effort: 'high',
        thinking: 'off',
        skills: ['implement'],
        stageSkills: {},
        workflow: {
          mode: 'staged',
          stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
          approvals: { channel: 'telegram', autoAdvance: false },
          syncTasksToBacklog: true,
          sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
          stepGuidance: {},
        },
      },
      epics: [{
        id: 'e1', title: 'Epic', features: [{
          id: 'feat-1', title: 'F', tool: 'codex', effort: 'high', skills: ['implement'],
          tasks: [], dependsOn: [],
        }],
      }],
    });
    mockBacklogSchemaParse.mockReturnValue(parsedResult);
  mockReadFileSync.mockReturnValue('yaml content');
  mockLoadRepoConfig.mockReset().mockReturnValue({ defaults: {} });

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const result = loadBacklog('/abs/backlog.yaml', '/abs');
    expect(result.epics[0]?.features[0]?.tool).toBe('codex');
  });

  it('does NOT overwrite feature.tool when already set', async () => {
    const rawV2 = makeRawV2({
      epics: [{
        id: 'e1', title: 'Epic', features: [{
          id: 'feat-1', title: 'F', tool: 'claude', effort: undefined, skills: undefined,
          tasks: [], dependsOn: [],
        }],
      }],
    });
    mockParse.mockReturnValue(rawV2);

    const parsedResult = makeV2Backlog({
      defaults: {
        tool: 'codex',
        effort: 'high',
        thinking: 'off',
        skills: [],
        stageSkills: {},
        workflow: {
          mode: 'staged',
          stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
          approvals: { channel: 'telegram', autoAdvance: false },
          syncTasksToBacklog: true,
          sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
          stepGuidance: {},
        },
      },
      epics: [{
        id: 'e1', title: 'Epic', features: [{
          id: 'feat-1', title: 'F', tool: 'claude', effort: 'high', skills: [],
          tasks: [], dependsOn: [],
        }],
      }],
    });
    mockBacklogSchemaParse.mockReturnValue(parsedResult);
    mockReadFileSync.mockReturnValue('yaml');

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const result = loadBacklog('/abs/backlog.yaml', '/abs');
    expect(result.epics[0]?.features[0]?.tool).toBe('claude');
  });

  it('propagates defaults.skills to feature when feature.skills is undefined', async () => {
    const rawV2 = makeRawV2({
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', skills: undefined, tasks: [], dependsOn: [],
        }],
      }],
    });
    mockParse.mockReturnValue(rawV2);

    const parsedResult = makeV2Backlog({
      defaults: { tool: 'claude', effort: 'medium', skills: ['implement', 'review'], stageSkills: {} },
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', tool: 'claude', effort: 'medium', skills: ['implement', 'review'],
          tasks: [], dependsOn: [],
        }],
      }],
    });
    mockBacklogSchemaParse.mockReturnValue(parsedResult);
    mockReadFileSync.mockReturnValue('yaml');

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const result = loadBacklog('/abs/backlog.yaml');
    expect(result.epics[0]?.features[0]?.skills).toEqual(['implement', 'review']);
  });

  it('propagates defaults.skills to task when task.skills is undefined', async () => {
    const rawV2 = makeRawV2({
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', skills: undefined,
          tasks: [{ id: 't1', title: 'T', status: 'todo', skills: undefined, dependsOn: [] }],
          dependsOn: [],
        }],
      }],
    });
    mockParse.mockReturnValue(rawV2);

    const parsedResult = makeV2Backlog({
      defaults: { tool: 'claude', effort: 'medium', skills: ['test'], stageSkills: {} },
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', tool: 'claude', effort: 'medium', skills: ['test'],
          tasks: [{ id: 't1', title: 'T', status: 'todo', skills: ['test'], dependsOn: [] }],
          dependsOn: [],
        }],
      }],
    });
    mockBacklogSchemaParse.mockReturnValue(parsedResult);
    mockReadFileSync.mockReturnValue('yaml');

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const result = loadBacklog('/abs/backlog.yaml');
    expect(result.epics[0]?.features[0]?.tasks[0]?.skills).toEqual(['test']);
  });

  it('validates specFile exists and throws if missing', async () => {
    mockParse.mockReturnValue({ version: 2 });
    const parsedResult = makeV2Backlog({
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', tool: 'claude', effort: 'medium', skills: [], dependsOn: [],
          specFile: 'missing-spec.md',
          tasks: [],
        }],
      }],
    });
    mockBacklogSchemaParse.mockReturnValue(parsedResult);
    mockReadFileSync.mockReturnValue('yaml');
    mockExistsSync.mockReturnValue(false); // file does not exist

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    expect(() => loadBacklog('/abs/backlog.yaml', '/abs')).toThrow('specFile not found');
    expect(() => loadBacklog('/abs/backlog.yaml', '/abs')).toThrow('missing-spec.md');
  });

  it('validates taskFile exists and throws if missing', async () => {
    mockParse.mockReturnValue({ version: 2 });
    const parsedResult = makeV2Backlog({
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', tool: 'claude', effort: 'medium', skills: [], dependsOn: [],
          tasks: [{
            id: 't1', title: 'Task', status: 'todo', skills: [], dependsOn: [],
            taskFile: 'missing-task.md',
          }],
        }],
      }],
    });
    mockBacklogSchemaParse.mockReturnValue(parsedResult);
    mockReadFileSync.mockReturnValue('yaml');
    mockExistsSync.mockReturnValue(false);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    expect(() => loadBacklog('/abs/backlog.yaml', '/abs')).toThrow('taskFile not found');
  });

  it('does not throw when specFile exists', async () => {
    mockParse.mockReturnValue({ version: 2 });
    const parsedResult = makeV2Backlog({
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', tool: 'claude', effort: 'medium', skills: [], dependsOn: [],
          specFile: 'spec.md',
          tasks: [],
        }],
      }],
    });
    mockBacklogSchemaParse.mockReturnValue(parsedResult);
    mockReadFileSync.mockReturnValue('yaml');
    mockExistsSync.mockReturnValue(true); // file exists

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    expect(() => loadBacklog('/abs/backlog.yaml', '/abs')).not.toThrow();
  });

  it('skips validation for features without specFile', async () => {
    mockParse.mockReturnValue({ version: 2 });
    const parsedResult = makeV2Backlog({
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', tool: 'claude', effort: 'medium', skills: [], dependsOn: [],
          tasks: [],
        }],
      }],
    });
    mockBacklogSchemaParse.mockReturnValue(parsedResult);
    mockReadFileSync.mockReturnValue('yaml');

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    expect(() => loadBacklog('/abs/backlog.yaml', '/abs')).not.toThrow();
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  it('uses version 1 normalization when parsed version is 1', async () => {
    const rawV1 = { version: 1 }; // not a V2 structure
    mockParse.mockReturnValue(rawV1);

    const parsedV1 = {
      version: 1 as const,
      repo: 'repo1',
      epics: [{
        id: 'e1', title: 'Epic', features: [{
          id: 'f1', title: 'Feature', tool: 'claude' as const, effort: 'medium' as const,
          skills: [], dependsOn: [],
          tasks: [{ id: 't1', title: 'T', status: 'todo', skills: [], dependsOn: [] }],
        }],
      }],
    };
    mockBacklogSchemaParse.mockReturnValue(parsedV1);
    mockReadFileSync.mockReturnValue('yaml');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const result = loadBacklog('/abs/backlog.yaml', '/abs');
    expect(result.version).toBe(2); // normalized to v2
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('v1 format'));
    consoleSpy.mockRestore();
  });

  it('normalizeV1 sets default skills for features without skills', async () => {
    mockParse.mockReturnValue({ version: 1 });
    const parsedV1 = {
      version: 1 as const,
      repo: 'repo1',
      epics: [{
        id: 'e1', title: 'E', features: [{
          id: 'f1', title: 'F', tool: 'claude' as const, effort: 'medium' as const,
          skills: undefined, dependsOn: [],
          tasks: [{ id: 't1', title: 'T', status: 'todo', skills: undefined, dependsOn: [] }],
        }],
      }],
    };
    mockBacklogSchemaParse.mockReturnValue(parsedV1);
    mockReadFileSync.mockReturnValue('yaml');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const result = loadBacklog('/abs/backlog.yaml', '/abs');
    expect(result.epics[0]?.features[0]?.skills).toEqual([]);
    expect(result.epics[0]?.features[0]?.tasks[0]?.skills).toEqual([]);
  });

  it('resolves relative path with cwd when path is not absolute', async () => {
    mockParse.mockReturnValue({ version: 2 });
    mockBacklogSchemaParse.mockReturnValue(makeV2Backlog());
    mockReadFileSync.mockReturnValue('yaml');

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    loadBacklog('backlog.yaml', '/my/cwd');

    const [calledPath] = mockReadFileSync.mock.calls[0]!;
    expect(calledPath).toContain('/my/cwd');
    expect(calledPath).toContain('backlog.yaml');
  });

  it('does not apply defaults when raw.version !== 2', async () => {
    // A non-V2 YAML skips applyDefaultsBeforeParse and goes straight to BacklogSchema.parse
    mockParse.mockReturnValue({ version: 1 });
    const parsedV1 = {
      version: 1 as const, repo: 'r', epics: [],
    };
    mockBacklogSchemaParse.mockReturnValue(parsedV1);
    mockReadFileSync.mockReturnValue('yaml');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    // Should not throw
    expect(() => loadBacklog('/abs/backlog.yaml', '/abs')).not.toThrow();
  });

  it('handles epic without features array (empty features)', async () => {
    const rawV2 = makeRawV2({
      epics: [{ id: 'e1', title: 'E', features: [] }],
    });
    mockParse.mockReturnValue(rawV2);
    mockBacklogSchemaParse.mockReturnValue(makeV2Backlog({
      epics: [{ id: 'e1', title: 'E', features: [] }],
    }));
    mockReadFileSync.mockReturnValue('yaml');

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const result = loadBacklog('/abs/backlog.yaml', '/abs');
    expect(result.epics[0]?.features).toHaveLength(0);
  });

  it('preserves workflow.stepGuidance through version 2 parsing and hydration', async () => {
    const rawV2 = makeRawV2({
      epics: [{
        id: 'e1',
        title: 'E',
        features: [{
          id: 'f1',
          title: 'F',
          tasks: [],
          dependsOn: [],
          workflow: {
            mode: 'staged',
            stages: ['implement'],
            approvals: { channel: 'telegram', autoAdvance: false },
            syncTasksToBacklog: true,
            sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
            stepGuidance: {
              implement: {
                skills: ['repo-implement-guardrails'],
                prompt: 'Implement only.',
              },
            },
          },
        }],
      }],
    });
    mockParse.mockReturnValue(rawV2);
    mockBacklogSchemaParse.mockReturnValue(makeV2Backlog({
      epics: [{
        id: 'e1',
        title: 'E',
        features: [{
          id: 'f1',
          title: 'F',
          tool: 'codex',
          effort: 'high',
          skills: ['implement'],
          tasks: [],
          dependsOn: [],
          workflow: rawV2.epics[0].features[0].workflow,
        }],
      }],
    }));
    mockReadFileSync.mockReturnValue('yaml');

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const result = loadBacklog('/abs/backlog.yaml', '/abs');
    expect(result.epics[0]?.features[0]?.workflow.stepGuidance).toEqual({
      implement: {
        skills: ['repo-implement-guardrails'],
        prompt: 'Implement only.',
      },
    });
  });
});
