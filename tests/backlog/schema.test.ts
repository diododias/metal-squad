import { describe, it, expect } from 'vitest';
import { BacklogInputSchema, BacklogSchema, BacklogV1Schema, BacklogV2Schema, createRegisteredToolSchema, dependencyType, EpicSchema, FallbackAlternativeSchema, RetrySchema, stackDependencies } from '../../src/core/backlog/schema.js';

const V1_YAML_OBJ = {
  version: 1,
  repo: 'test-repo',
  epics: [
    {
      id: 'epic-1',
      title: 'Epic',
      features: [
        {
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          dependsOn: [],
          tasks: [{ id: 'task-1', title: 'Task', dependsOn: [] }],
        },
      ],
    },
  ],
};

const V2_YAML_OBJ = {
  version: 2,
  repo: 'test-repo',
  defaults: { tool: 'claude', effort: 'medium', skills: ['implement'] },
  epics: [
    {
      id: 'epic-1',
      title: 'Epic',
      features: [
        {
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          skills: ['specify', 'implement'],
          workflow: {
            mode: 'staged',
            stages: ['specify', 'plan', 'tasks'],
            approvals: { channel: 'telegram', autoAdvance: false },
            syncTasksToBacklog: true,
            sessionPolicy: {
              mode: 'adaptive',
              alwaysIsolatedStages: ['specify'],
            },
          },
          specFile: undefined,
          context: ['src/core/backlog/schema.ts'],
          dependsOn: [],
          tasks: [
            {
              id: 'task-1',
              title: 'Task',
              skills: ['implement'],
              taskFile: undefined,
              dependsOn: [],
            },
          ],
        },
      ],
    },
  ],
};

describe('BacklogV1Schema', () => {
  it('parses a valid v1 object', () => {
    const result = BacklogV1Schema.safeParse(V1_YAML_OBJ);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.repo).toBe('test-repo');
    }
  });

  it('defaults version to 1 when missing', () => {
    const obj = { repo: 'test-repo', epics: [] };
    const result = BacklogV1Schema.safeParse(obj);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(1);
  });

  it('rejects version 2', () => {
    const result = BacklogV1Schema.safeParse({ ...V1_YAML_OBJ, version: 2 });
    expect(result.success).toBe(false);
  });
});

describe('tool registry references', () => {
  it('accepts multiple registered ids for the same adapter', () => {
    const schema = createRegisteredToolSchema(['codex', 'codex-canary']);

    expect(schema.safeParse('codex').success).toBe(true);
    expect(schema.safeParse('codex-canary').success).toBe(true);
  });

  it('rejects an unregistered tool with an actionable error', () => {
    const result = createRegisteredToolSchema(['claude', 'codex']).safeParse('missing-tool');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Tool "missing-tool" is not registered');
      expect(result.error.issues[0]?.message).toContain('claude, codex');
    }
  });
});

describe('BacklogV2Schema', () => {
  it('defaults dependencies to stack and excludes explicitly logical dependencies from stack bases', () => {
    const feature = BacklogV2Schema.parse({
      ...V2_YAML_OBJ,
      epics: [{
        ...V2_YAML_OBJ.epics[0],
        features: [{
          ...V2_YAML_OBJ.epics[0].features[0],
          dependsOn: ['feat-stack', 'feat-logical'],
          dependencyTypes: { 'feat-logical': 'logical' },
        }],
      }],
    }).epics[0]?.features[0];

    expect(feature?.dependsOn).toEqual(['feat-stack', 'feat-logical']);
    expect(dependencyType(feature!, 'feat-stack')).toBe('stack');
    expect(dependencyType(feature!, 'feat-logical')).toBe('logical');
    expect(stackDependencies(feature!)).toEqual(['feat-stack']);
  });

  it('rejects dependency types that do not reference dependsOn', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      epics: [{
        ...V2_YAML_OBJ.epics[0],
        features: [{
          ...V2_YAML_OBJ.epics[0].features[0],
          dependsOn: ['feat-stack'],
          dependencyTypes: { 'feat-other': 'logical' },
        }],
      }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['epics', 0, 'features', 0, 'dependencyTypes', 'feat-other'],
      }));
    }
  });

  it('accepts an approval channel that references a configured notification type', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      epics: [{
        ...V2_YAML_OBJ.epics[0],
        features: [{
          ...V2_YAML_OBJ.epics[0].features[0],
          workflow: {
            ...V2_YAML_OBJ.epics[0].features[0].workflow,
            approvals: { channel: 'slack', autoAdvance: false },
          },
        }],
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.epics[0]?.features[0]?.workflow.approvals.channel).toBe('slack');
  });

  it('parses a valid v2 object', () => {
    const result = BacklogV2Schema.safeParse(V2_YAML_OBJ);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(2);
      expect(result.data.defaults.skills).toEqual(['implement']);
      expect(result.data.epics[0]?.features[0]?.workflow?.mode).toBe('staged');
    }
  });

  it('migrates approvals.autoAdvance to the unified workflow.autoAdvance field', () => {
    const result = BacklogV2Schema.parse(V2_YAML_OBJ);
    const workflow = result.epics[0]?.features[0]?.workflow;
    expect(workflow?.autoAdvance).toBe(false);
    expect(workflow?.approvals).toEqual({ channel: 'telegram' });
  });

  it('applies defaults when defaults block is missing', () => {
    const obj = { version: 2, repo: 'test-repo', epics: [] };
    const result = BacklogV2Schema.safeParse(obj);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaults.tool).toBe('claude');
      expect(result.data.defaults.effort).toBe('medium');
      expect(result.data.defaults.thinking).toBe('off');
      expect(result.data.defaults.skills).toEqual([]);
    }
  });

  it('accepts model, effort and thinking as independent fields on defaults and feature', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      defaults: { tool: 'claude', model: 'opus', effort: 'high', thinking: 'on' },
      epics: [
        {
          ...V2_YAML_OBJ.epics[0],
          features: [
            {
              ...V2_YAML_OBJ.epics[0].features[0],
              model: 'sonnet',
              effort: 'low',
              thinking: 'on',
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaults).toMatchObject({ model: 'opus', effort: 'high', thinking: 'on' });
      const feat = result.data.epics[0]?.features[0];
      expect(feat).toMatchObject({ model: 'sonnet', effort: 'low', thinking: 'on' });
    }
  });

  it('rejects an invalid thinking value', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      defaults: { tool: 'claude', thinking: 'maybe' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects version 1', () => {
    const result = BacklogV2Schema.safeParse({ ...V2_YAML_OBJ, version: 1 });
    expect(result.success).toBe(false);
  });

  it('parses feature with specFile and context', () => {
    const result = BacklogV2Schema.safeParse(V2_YAML_OBJ);
    expect(result.success).toBe(true);
    if (result.success) {
      const feat = result.data.epics[0]?.features[0];
      expect(feat?.skills).toEqual(['specify', 'implement']);
      expect(feat?.context).toEqual(['src/core/backlog/schema.ts']);
      expect(feat?.workflow.sessionPolicy).toEqual({
        mode: 'adaptive',
        alwaysIsolatedStages: ['specify'],
      });
    }
  });

  it('defaults workflow.sessionPolicy when omitted', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      epics: [
        {
          ...V2_YAML_OBJ.epics[0],
          features: [
            {
              ...V2_YAML_OBJ.epics[0].features[0],
              workflow: {
                mode: 'staged',
                stages: ['specify', 'plan'],
                approvals: { channel: 'telegram', autoAdvance: false },
                syncTasksToBacklog: true,
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.epics[0]?.features[0]?.workflow.sessionPolicy).toEqual({
        mode: 'isolated',
        alwaysIsolatedStages: [],
      });
      expect(result.data.epics[0]?.features[0]?.workflow.stepGuidance).toEqual({});
    }
  });

  it('parses workflow.stepGuidance for declared stages', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      epics: [
        {
          ...V2_YAML_OBJ.epics[0],
          features: [
            {
              ...V2_YAML_OBJ.epics[0].features[0],
              workflow: {
                ...V2_YAML_OBJ.epics[0].features[0].workflow,
                stepGuidance: {
                  plan: {
                    skills: ['repo-implement-guardrails'],
                    prompt: 'Touch only the plan step.',
                  },
                },
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.epics[0]?.features[0]?.workflow.stepGuidance).toEqual({
        plan: {
          skills: ['repo-implement-guardrails'],
          prompt: 'Touch only the plan step.',
        },
      });
    }
  });

  it('rejects workflow.stepGuidance keys not present in workflow.stages', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      epics: [
        {
          ...V2_YAML_OBJ.epics[0],
          features: [
            {
              ...V2_YAML_OBJ.epics[0].features[0],
              workflow: {
                ...V2_YAML_OBJ.epics[0].features[0].workflow,
                stepGuidance: {
                  validate: {
                    prompt: 'This stage is not in the workflow.',
                  },
                },
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects sessionPolicy.alwaysIsolatedStages entries not present in workflow.stages', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      epics: [
        {
          ...V2_YAML_OBJ.epics[0],
          features: [
            {
              ...V2_YAML_OBJ.epics[0].features[0],
              workflow: {
                mode: 'staged',
                stages: ['specify', 'plan'],
                approvals: { channel: 'telegram', autoAdvance: false },
                syncTasksToBacklog: true,
                sessionPolicy: {
                  mode: 'adaptive',
                  alwaysIsolatedStages: ['validate'],
                },
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('parses task with taskFile and skills', () => {
    const result = BacklogV2Schema.safeParse(V2_YAML_OBJ);
    expect(result.success).toBe(true);
    if (result.success) {
      const task = result.data.epics[0]?.features[0]?.tasks[0];
      expect(task?.skills).toEqual(['implement']);
    }
  });

  it('parses retry policy with defaults and onFail', () => {
    const result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      epics: [
        {
          ...V2_YAML_OBJ.epics[0],
          features: [
            {
              ...V2_YAML_OBJ.epics[0].features[0],
              retry: {
                maxAttempts: 3,
                backoffMs: 1500,
                onFail: 'continue',
              },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.epics[0]?.features[0]?.retry).toEqual({
        maxAttempts: 3,
        backoffMs: 1500,
        onFail: 'continue',
        fallback: [],
      });
    }
  });
});

describe('FallbackAlternativeSchema / RetrySchema.fallback', () => {
  it('defaults fallback to an empty array when omitted', () => {
    const result = RetrySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.fallback).toEqual([]);
  });

  it('parses a fallback alternative with only tool set, defaulting maxAttempts to 1', () => {
    const result = FallbackAlternativeSchema.safeParse({ tool: 'codex' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ tool: 'codex', maxAttempts: 1 });
    }
  });

  it('parses a fallback alternative with model/effort/maxAttempts overrides', () => {
    const result = FallbackAlternativeSchema.safeParse({
      tool: 'opencode',
      model: 'gpt-4o',
      effort: 'high',
      maxAttempts: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ tool: 'opencode', model: 'gpt-4o', effort: 'high', maxAttempts: 2 });
    }
  });

  it('rejects maxAttempts outside the 1-10 range', () => {
    expect(FallbackAlternativeSchema.safeParse({ tool: 'codex', maxAttempts: 0 }).success).toBe(false);
    expect(FallbackAlternativeSchema.safeParse({ tool: 'codex', maxAttempts: 11 }).success).toBe(false);
  });

  it('rejects a fallback alternative without a tool', () => {
    expect(FallbackAlternativeSchema.safeParse({ model: 'gpt-4o' }).success).toBe(false);
  });

  it('parses retry.fallback as an ordered list of alternatives, valid in both v1 and v2 backlogs', () => {
    const retryWithFallback = {
      maxAttempts: 2,
      backoffMs: 5000,
      onFail: 'gate',
      fallback: [
        { tool: 'codex', maxAttempts: 2 },
        { tool: 'opencode', model: 'gpt-4o', maxAttempts: 1 },
      ],
    };

    const v1Result = BacklogV1Schema.safeParse({
      ...V1_YAML_OBJ,
      epics: [
        {
          ...V1_YAML_OBJ.epics[0],
          features: [{ ...V1_YAML_OBJ.epics[0].features[0], retry: retryWithFallback }],
        },
      ],
    });
    expect(v1Result.success).toBe(true);
    if (v1Result.success) {
      expect(v1Result.data.epics[0]?.features[0]?.retry?.fallback).toEqual(retryWithFallback.fallback);
    }

    const v2Result = BacklogV2Schema.safeParse({
      ...V2_YAML_OBJ,
      epics: [
        {
          ...V2_YAML_OBJ.epics[0],
          features: [{ ...V2_YAML_OBJ.epics[0].features[0], retry: retryWithFallback }],
        },
      ],
    });
    expect(v2Result.success).toBe(true);
    if (v2Result.success) {
      expect(v2Result.data.epics[0]?.features[0]?.retry?.fallback).toEqual(retryWithFallback.fallback);
    }
  });
});

describe('feature authoring identity boundary', () => {
  it('accepts omitted feature IDs only at the input boundary', () => {
    const parsed = BacklogInputSchema.parse({
      version: 2,
      repo: 'demo',
      defaults: {},
      epics: [{ id: 'epic-1', title: 'Epic', features: [{ title: 'New feature' }] }],
    });
    expect(parsed.epics[0]?.features[0]?.id).toBeUndefined();
    expect(() => BacklogSchema.parse(parsed)).toThrow();
  });

  it('keeps EpicSchema IDs independent from feature registration', () => {
    expect(EpicSchema.parse({ id: 'epic-legacy', title: 'Epic', features: [] }).id).toBe('epic-legacy');
  });
});

describe('BacklogSchema (union)', () => {
  it('routes version 1 to BacklogV1Schema', () => {
    const result = BacklogSchema.safeParse(V1_YAML_OBJ);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(1);
  });

  it('routes version 2 to BacklogV2Schema', () => {
    const result = BacklogSchema.safeParse(V2_YAML_OBJ);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(2);
  });

  it('defaults missing version to v1', () => {
    const obj = { repo: 'test-repo', epics: [] };
    const result = BacklogSchema.safeParse(obj);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBe(1);
  });

  it('rejects unknown version', () => {
    const result = BacklogSchema.safeParse({ ...V1_YAML_OBJ, version: 99 });
    expect(result.success).toBe(false);
  });
});

describe('defaults propagation (via BacklogV2Schema)', () => {
  it('features without skills still parse (skills optional in schema)', () => {
    const obj = {
      version: 2,
      repo: 'r',
      defaults: { tool: 'claude', effort: 'medium', skills: ['implement'] },
      epics: [
        {
          id: 'e1',
          title: 'E',
          features: [{ id: 'f1', title: 'F', dependsOn: [], tasks: [] }],
        },
      ],
    };
    const result = BacklogV2Schema.safeParse(obj);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.epics[0]?.features[0]?.skills).toBeUndefined();
    }
  });
});
