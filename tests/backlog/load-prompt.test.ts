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

  it('renders skill templates in order and joins with separator', async () => {
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

    expect(prompt).toBe('Step A for feat-1\n\n---\n\nStep B for My Feature');
  });

  it('injects specFile content via {{spec}} placeholder', async () => {
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
      { id: 'f1', title: 'F', specFile: 'specs/f.md', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      skills,
      cwd,
    );

    expect(prompt).toContain('Implement: f1');
    expect(prompt).toContain('The spec content');
  });

  it('injects context files via {{context}} placeholder, skips missing files', async () => {
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

    expect(prompt).toContain('--- ctx/a.md ---\nContext A');
    expect(prompt).not.toContain('missing.md');
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

  it('respects inputs filter: specFile-only skill gets spec but not context', async () => {
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
    expect(prompt).not.toContain('CTX_DATA');
    expect(prompt).toContain('ctx=');
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
      '[msq] backlog.yaml está em formato v1 — considere atualizar para version: 2',
    );
    expect(backlog.version).toBe(2);
    expect(backlog.defaults.skills).toEqual(['implement']);
    expect(backlog.epics[0]?.features[0]?.skills).toEqual(['implement']);
    expect(backlog.epics[0]?.features[0]?.tasks[0]?.skills).toEqual(['implement']);
  });

  it('propagates defaults in v2 and validates referenced files', async () => {
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
        tool: codex
        effort: medium
        dependsOn: []
        specFile: specs/feat.md
        tasks:
          - id: task-1
            title: Task
            taskFile: tasks/task.md
`);

    const { loadBacklog } = await import('../../src/core/backlog/load.js');
    const backlog = loadBacklog(undefined, cwd);

    expect(backlog.epics[0]?.features[0]?.skills).toEqual(['implement', 'test']);
    expect(backlog.epics[0]?.features[0]?.tasks[0]?.skills).toEqual(['implement', 'test']);
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

  it('builds a prompt with optional spec and context files', async () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-prompt-'));
    mkdirSync(join(cwd, 'specs'));
    mkdirSync(join(cwd, 'context'));
    writeFileSync(join(cwd, 'specs', 'feat.md'), 'Detailed spec');
    writeFileSync(join(cwd, 'context', 'notes.md'), 'Context details');

    const { buildSpecKitPrompt } = await import('../../src/core/backlog/prompt.js');
    const prompt = buildSpecKitPrompt({
      id: 'feat-1',
      title: 'Feature',
      spec: 'Short summary',
      specFile: 'specs/feat.md',
      context: ['context/notes.md', 'context/missing.md'],
      skills: ['implement', 'test'],
      tool: 'codex',
      effort: 'medium',
      dependsOn: [],
      tasks: [],
    }, cwd);

    expect(prompt).toContain('Rode o fluxo spec-kit para a feature "feat-1" (Feature).');
    expect(prompt).toContain('Contexto adicional: Short summary');
    expect(prompt).toContain('Spec detalhada (specs/feat.md):\nDetailed spec');
    expect(prompt).toContain('Skills: implement, test');
    expect(prompt).toContain('--- context/notes.md ---\nContext details');
    expect(prompt).not.toContain('context/missing.md');
  });
});
