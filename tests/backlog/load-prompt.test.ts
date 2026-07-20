import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('buildPrompt — dynamic skill-based prompt builder', () => {
  let cwd = '';

  afterEach(() => {
    vi.restoreAllMocks();
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    cwd = '';
  });

  it('renders skill commands in order before the feature specification', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const skills = [
      {
        name: 'a',
        source: 'builtin' as const,
        promptTemplate: 'Step A for {{featureId}}',
        metadata: { description: 'A' },
      },
      {
        name: 'b',
        source: 'builtin' as const,
        promptTemplate: 'Step B for {{featureTitle}}',
        metadata: { description: 'B' },
      },
    ];
    const prompt = buildPrompt(
      { id: 'feat-1', title: 'My Feature', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      skills,
    );

    expect(prompt).toBe('/a\n\n---\n\n/b\n\n---\n\nFeature: feat-1 — My Feature');
  });

  it('always injects specFile content without exposing the skill template', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-buildprompt-'));
    mkdirSync(join(cwd, 'specs'));
    writeFileSync(join(cwd, 'specs', 'f.md'), 'The spec content');

    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const skills = [
      {
        name: 'implement',
        source: 'builtin' as const,
        promptTemplate: 'Implement: {{featureId}}{{spec}}',
        metadata: { description: 'impl' },
      },
    ];
    const prompt = buildPrompt(
      {
        id: 'f1',
        title: 'F',
        spec: 'Short summary',
        specFile: 'specs/f.md',
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [],
      },
      skills,
      cwd,
    );

    expect(prompt.startsWith('/implement')).toBe(true);
    expect(prompt).not.toContain('Implement: f1');
    expect(prompt).toContain('Feature summary:\nShort summary');
    expect(prompt).toContain('The spec content');
  });

  it('injects context file paths (paths only) via {{context}} placeholder, skips missing files', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-buildprompt-'));
    mkdirSync(join(cwd, 'ctx'));
    writeFileSync(join(cwd, 'ctx', 'a.md'), 'Context A');

    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const skills = [
      {
        name: 'implement',
        source: 'builtin' as const,
        promptTemplate: 'Go{{context}}',
        metadata: { description: 'impl' },
      },
    ];
    const prompt = buildPrompt(
      {
        id: 'f1',
        title: 'F',
        context: ['ctx/a.md', 'ctx/missing.md'],
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [],
      },
      skills,
      cwd,
    );

    expect(prompt).toContain('- ctx/a.md');
    expect(prompt).not.toContain('Context A');
    expect(prompt).not.toContain('--- ctx/a.md ---');
    expect(prompt).not.toContain('missing.md');
  });

  it('expands directory entries in context into their readable file paths (no content)', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-buildprompt-'));
    mkdirSync(join(cwd, 'ctx'));
    mkdirSync(join(cwd, 'ctx', 'nested'));
    writeFileSync(join(cwd, 'ctx', 'a.ts'), 'export const a = 1;');
    writeFileSync(join(cwd, 'ctx', 'nested', 'b.ts'), 'export const b = 2;');

    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const skills = [
      {
        name: 'implement',
        source: 'builtin' as const,
        promptTemplate: '{{context}}',
        metadata: { description: 'impl', inputs: ['context'] },
      },
    ];
    const prompt = buildPrompt(
      {
        id: 'f1',
        title: 'F',
        context: ['ctx'],
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [],
      },
      skills,
      cwd,
    );

    expect(prompt).toContain('- ctx/a.ts');
    expect(prompt).toContain('- ctx/nested/b.ts');
    expect(prompt).not.toContain('export const a = 1;');
    expect(prompt).not.toContain('export const b = 2;');
  });

  it('falls back to builtin implement skill when skills array is empty', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const prompt = buildPrompt(
      { id: 'f1', title: 'My Feature', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      [],
    );

    expect(prompt).toContain('f1');
    expect(prompt).toContain('My Feature');
  });

  it('always includes technical context paths regardless of skill metadata inputs', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-buildprompt-'));
    mkdirSync(join(cwd, 'specs'));
    mkdirSync(join(cwd, 'ctx'));
    writeFileSync(join(cwd, 'specs', 'f.md'), 'SPEC_DATA');
    writeFileSync(join(cwd, 'ctx', 'c.md'), 'CTX_DATA');

    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const skills = [
      {
        name: 'spec-only',
        source: 'builtin' as const,
        promptTemplate: 'spec={{spec}} ctx={{context}}',
        metadata: { description: 'test', inputs: ['specFile'] },
      },
    ];
    const prompt = buildPrompt(
      {
        id: 'f1',
        title: 'F',
        specFile: 'specs/f.md',
        context: ['ctx/c.md'],
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [],
      },
      skills,
      cwd,
    );

    expect(prompt).toContain('SPEC_DATA');
    expect(prompt).toContain('- ctx/c.md');
    expect(prompt).not.toContain('CTX_DATA');
    expect(prompt).not.toContain('ctx=');
  });

  it('injects task metadata and taskFile path (no content) via {{tasks}} placeholder', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-buildprompt-'));
    mkdirSync(join(cwd, 'tasks'));
    writeFileSync(join(cwd, 'tasks', 't1.md'), 'Implement the parser');

    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const prompt = buildPrompt(
      {
        id: 'f1',
        title: 'F',
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [
          {
            id: 'task-1',
            title: 'Parser',
            dependsOn: [],
            skills: ['implement', 'test'],
            status: 'running',
            taskFile: 'tasks/t1.md',
          },
        ],
      },
      [
        {
          name: 'implement',
          source: 'builtin' as const,
          promptTemplate: 'Tasks:\n{{tasks}}',
          metadata: { description: 'impl', inputs: ['tasks'] },
        },
      ],
      cwd,
    );

    expect(prompt).toContain('## task-1 — Parser');
    expect(prompt).toContain('Status: running');
    expect(prompt).toContain('Skills: implement, test');
    expect(prompt).toContain('Task file: tasks/t1.md');
    expect(prompt).not.toContain('--- tasks/t1.md ---');
    expect(prompt).not.toContain('Implement the parser');
  });

  it('omits taskFile line when the file is missing', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-buildprompt-'));

    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const prompt = buildPrompt(
      {
        id: 'f1',
        title: 'F',
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [
          {
            id: 'task-1',
            title: 'Parser',
            dependsOn: [],
            skills: [],
            status: 'todo',
            taskFile: 'tasks/missing.md',
          },
        ],
      },
      [
        {
          name: 'implement',
          source: 'builtin' as const,
          promptTemplate: 'Tasks:\n{{tasks}}',
          metadata: { description: 'impl' },
        },
      ],
      cwd,
    );

    expect(prompt).toContain('## task-1 — Parser');
    expect(prompt).not.toContain('Task file:');
    expect(prompt).not.toContain('missing.md');
  });

  it('lists technical context as paths only (no content) regardless of maxContextChars', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-buildprompt-'));
    mkdirSync(join(cwd, 'ctx'));
    writeFileSync(join(cwd, 'ctx', 'big.md'), 'A'.repeat(160));

    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const prompt = buildPrompt(
      {
        id: 'f1',
        title: 'F',
        context: ['ctx/big.md'],
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [],
      },
      [
        {
          name: 'implement',
          source: 'builtin' as const,
          promptTemplate: '{{context}}',
          metadata: { description: 'impl', inputs: ['context'] },
        },
      ],
      cwd,
      { maxContextChars: 80 },
    );

    expect(prompt).not.toContain('[truncated to respect promptContextCharLimit]');
    expect(prompt).toContain('- ctx/big.md');
    expect(prompt).not.toContain('A'.repeat(160));
  });

  it('adds step-guidance skill prompts and direct prompt only for the active stage', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = {
      id: 'feat-1',
      title: 'My Feature',
      tool: 'claude' as const,
      effort: 'medium' as const,
      dependsOn: [],
      tasks: [],
      workflow: {
        mode: 'staged' as const,
        stages: ['plan', 'implement'],
        approvals: { channel: 'telegram' as const, autoAdvance: false },
        syncTasksToBacklog: true,
        sessionPolicy: { mode: 'isolated' as const, alwaysIsolatedStages: [] },
        stepGuidance: {
          implement: {
            prompt: 'Touch only implementation files.',
          },
        },
      },
    };
    const baseSkills = [{
      name: 'speckit-implement',
      source: 'builtin' as const,
      promptTemplate: 'Base implement prompt',
      metadata: { description: 'base' },
    }];
    const stepSkills = [{
      name: 'repo-implement-guardrails',
      source: 'repo' as const,
      promptTemplate: 'Extra guardrails',
      metadata: { description: 'extra' },
    }];

    const implementPrompt = buildPrompt(feature as never, baseSkills, '/cwd', {
      activeStage: 'implement',
      stepGuidanceSkills: stepSkills,
    });
    const planPrompt = buildPrompt(feature as never, baseSkills, '/cwd', {
      activeStage: 'plan',
      stepGuidanceSkills: [],
    });

    expect(implementPrompt).toContain('/speckit-implement');
    expect(implementPrompt).toContain('/repo-implement-guardrails');
    expect(implementPrompt).toContain('Touch only implementation files.');
    expect(planPrompt).toBe('/speckit-implement\n\n---\n\nFeature: feat-1 — My Feature');
  });

  it('renders a deterministic dependency-base block using the persisted remote branch and configured base', async () => {
    const { buildDependencyPublicationsSection } = await import('../../src/core/backlog/prompt.js');

    expect(buildDependencyPublicationsSection([{
      featureId: 'feat-dependency',
      prNumber: 160,
      prUrl: 'https://github.com/example/repo/pull/160',
      branchName: 'feat/dependency',
      remoteBranch: 'upstream/stack/feat/dependency',
    }], 'main')).toBe([
      '# dependency base',
      'base_branch=main',
      'base_remote=upstream/stack/feat/dependency',
      'base_ref=feat/dependency',
      'pr_base=feat/dependency',
      'git fetch upstream stack/feat/dependency && git switch -c <your-working-branch> FETCH_HEAD',
    ].join('\n'));
  });

  it('falls back to origin branch syntax and omits the block without publications', async () => {
    const { buildDependencyPublicationsSection } = await import('../../src/core/backlog/prompt.js');

    expect(buildDependencyPublicationsSection([{
      featureId: 'feat-dependency',
      prNumber: null,
      prUrl: 'https://github.com/example/repo/pull/160',
      branchName: 'feat/dependency',
      remoteBranch: null,
    }])).toContain('base_remote=origin/feat/dependency');
    expect(buildDependencyPublicationsSection([], 'main')).toBeNull();
  });
});

describe('backlog loading and prompt generation', () => {
  let cwd = '';

  afterEach(() => {
    vi.restoreAllMocks();
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    cwd = '';
  });

  it('normalizes v1 backlogs and warns about migration', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 1
repo: demo
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
        tool: codex
        effort: high
        dependsOn: []
        tasks:
          - id: task-1
            title: Task
`);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const backlog = loadBacklog(undefined, cwd);

    expect(warn).toHaveBeenCalledWith(
      '[msq] backlog.yaml is in v1 format — consider upgrading to version: 2',
    );
    expect(backlog.version).toBe(2);
    expect(backlog.defaults.skills).toEqual([]);
    expect(backlog.epics[0]?.features[0]?.skills).toEqual([]);
    expect(backlog.epics[0]?.features[0]?.tasks[0]?.skills).toEqual([]);
  });

  it('ignores legacy YAML defaults and resolves features from project defaults', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    mkdirSync(join(cwd, 'specs'));
    mkdirSync(join(cwd, 'tasks'));
    writeFileSync(join(cwd, 'specs', 'feat.md'), '# spec');
    writeFileSync(join(cwd, 'tasks', 'task.md'), '# task');
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: demo
defaults:
  tool: codex
  effort: medium
  skills: [implement, test]
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
        dependsOn: []
        specFile: specs/feat.md
        tasks:
          - id: task-1
            title: Task
            taskFile: tasks/task.md
`);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const backlog = loadBacklog(undefined, cwd);

    expect(warn).toHaveBeenCalledWith(
      '[msq] backlog.yaml defaults are ignored; configure defaults in the Projeto settings.',
    );
    expect(backlog.epics[0]?.features[0]?.tool).toBe('claude');
    expect(backlog.epics[0]?.features[0]?.effort).toBe('medium');
    expect(backlog.epics[0]?.features[0]?.skills).toEqual([]);
    expect(backlog.epics[0]?.features[0]?.tasks[0]?.skills).toEqual([]);
  });

  it('throws when referenced files are missing', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-'));
    writeFileSync(join(cwd, 'backlog.yaml'), `version: 2
repo: demo
defaults:
  tool: codex
  effort: medium
  skills: [implement]
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
        tool: codex
        effort: medium
        dependsOn: []
        specFile: specs/missing.md
        tasks: []
`);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');

    expect(() => loadBacklog(undefined, cwd)).toThrow(
      /specFile not found: specs\/missing\.md/,
    );
  });

  it('falls back to the builtin implement command when no skill resolves', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-prompt-'));
    mkdirSync(join(cwd, 'specs'));
    mkdirSync(join(cwd, 'context'));
    writeFileSync(join(cwd, 'specs', 'feat.md'), 'Detailed spec');
    writeFileSync(join(cwd, 'context', 'notes.md'), 'Context details');

    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const prompt = buildPrompt({
      id: 'feat-1',
      title: 'Feature',
      spec: 'Short summary',
      specFile: 'specs/feat.md',
      context: ['context/notes.md', 'context/missing.md'],
      skills: [],
      tool: 'codex',
      effort: 'medium',
      dependsOn: [],
      tasks: [],
    }, [], cwd);

    expect(prompt.startsWith('/implement')).toBe(true);
    expect(prompt).toContain('Feature summary:\nShort summary');
    // spec stays inlined; context files become paths only
    expect(prompt).toContain('--- specs/feat.md ---\nDetailed spec');
    expect(prompt).toContain('- context/notes.md');
    expect(prompt).not.toContain('Context details');
    expect(prompt).not.toContain('--- context/notes.md ---');
    expect(prompt).not.toContain('context/missing.md');
  });
});
