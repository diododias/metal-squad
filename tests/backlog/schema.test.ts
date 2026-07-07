import { describe, it, expect } from 'vitest';
import { BacklogSchema, BacklogV1Schema, BacklogV2Schema } from '../../src/core/backlog/schema.js';

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

describe('BacklogV2Schema', () => {
  it('parses a valid v2 object', () => {
    const result = BacklogV2Schema.safeParse(V2_YAML_OBJ);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(2);
      expect(result.data.defaults.skills).toEqual(['implement']);
      expect(result.data.epics[0]?.features[0]?.workflow?.mode).toBe('staged');
    }
  });

  it('applies defaults when defaults block is missing', () => {
    const obj = { version: 2, repo: 'test-repo', epics: [] };
    const result = BacklogV2Schema.safeParse(obj);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaults.tool).toBe('claude');
      expect(result.data.defaults.effort).toBe('medium');
      expect(result.data.defaults.skills).toEqual(['implement']);
    }
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
    }
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
      });
    }
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
