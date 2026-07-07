import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import {
  applyDecomposedTasks,
  decomposeOutputPath,
  formatDecomposeSummary,
  parseDecomposeOutput,
  readDecomposeOutput,
} from '../../src/core/backlog/decompose.js';

const BACKLOG = `version: 2
repo: demo
defaults:
  tool: codex
  effort: medium
  skills: []
epics:
  - id: epic-1
    title: Epic
    features:
      - id: feat-1
        title: Feature
        tool: codex
        effort: medium
        dependsOn: []
        tasks:
          - id: legacy-1
            title: Old manual task
            status: done
            dependsOn: []
`;

const SUGGESTION = `tasks:
  - id: task-01
    title: Update schema
    skills: [implement]
    estimate:
      tokens: ~15k
      duration: ~5min
      files: [src/core/backlog/schema.ts]
    dependsOn: []
  - id: task-02
    title: Add validation
    skills: [implement, test]
    dependsOn: [task-01]
`;

describe('decompose output parsing', () => {
  it('parses a valid suggestion', () => {
    const output = parseDecomposeOutput(SUGGESTION);
    expect(output.tasks).toHaveLength(2);
    expect(output.tasks[0]?.estimate?.files).toEqual(['src/core/backlog/schema.ts']);
    expect(output.tasks[1]?.dependsOn).toEqual(['task-01']);
  });

  it('rejects duplicated task ids', () => {
    const raw = 'tasks:\n  - id: a\n    title: A\n  - id: a\n    title: B\n';
    expect(() => parseDecomposeOutput(raw)).toThrow(/duplicated/);
  });

  it('rejects dependencies on unknown tasks', () => {
    const raw = 'tasks:\n  - id: a\n    title: A\n    dependsOn: [ghost]\n';
    expect(() => parseDecomposeOutput(raw)).toThrow(/unknown task/);
  });

  it('rejects empty output', () => {
    expect(() => parseDecomposeOutput('tasks: []')).toThrow(/Invalid decompose output/);
  });

  it('formats a human-readable summary with estimates', () => {
    const summary = formatDecomposeSummary('feat-1', parseDecomposeOutput(SUGGESTION));
    expect(summary).toContain('task-01: Update schema');
    expect(summary).toContain('tokens ~15k');
    expect(summary).toContain('depende de task-01');
  });
});

describe('decompose apply', () => {
  let cwd = '';

  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    cwd = '';
  });

  const setup = (): void => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-decompose-'));
    writeFileSync(join(cwd, 'backlog.yaml'), BACKLOG);
    const outputPath = decomposeOutputPath('feat-1', cwd);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, SUGGESTION);
  };

  it('reads the generated suggestion from the deterministic path', () => {
    setup();
    const output = readDecomposeOutput('feat-1', cwd);
    expect(output.tasks.map((task) => task.id)).toEqual(['task-01', 'task-02']);
  });

  it('fails clearly when the suggestion file is missing', () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-decompose-'));
    expect(() => readDecomposeOutput('feat-1', cwd)).toThrow(/not found/);
  });

  it('applies suggested tasks preserving unrelated existing tasks', () => {
    setup();
    const count = applyDecomposedTasks('feat-1', readDecomposeOutput('feat-1', cwd).tasks, cwd);
    expect(count).toBe(2);

    const backlog = parse(readFileSync(join(cwd, 'backlog.yaml'), 'utf8'));
    const tasks = backlog.epics[0].features[0].tasks;
    expect(tasks.map((task: { id: string }) => task.id)).toEqual(['legacy-1', 'task-01', 'task-02']);
    expect(tasks[1]).toMatchObject({ id: 'task-01', status: 'todo', skills: ['implement'] });
  });

  it('is idempotent across reruns and preserves task status', () => {
    setup();
    const tasks = readDecomposeOutput('feat-1', cwd).tasks;
    applyDecomposedTasks('feat-1', tasks, cwd);

    // simulate progress, then re-apply the same suggestion
    const backlogPath = join(cwd, 'backlog.yaml');
    const progressed = readFileSync(backlogPath, 'utf8').replace(
      'id: task-01\n            title: Update schema\n            status: todo',
      'id: task-01\n            title: Update schema\n            status: done',
    );
    writeFileSync(backlogPath, progressed);

    applyDecomposedTasks('feat-1', tasks, cwd);
    const backlog = parse(readFileSync(backlogPath, 'utf8'));
    const applied = backlog.epics[0].features[0].tasks;
    expect(applied.map((task: { id: string }) => task.id)).toEqual(['legacy-1', 'task-01', 'task-02']);
    expect(applied.filter((task: { id: string }) => task.id === 'task-01')).toHaveLength(1);
  });

  it('throws when the feature does not exist', () => {
    setup();
    expect(() => applyDecomposedTasks('ghost', readDecomposeOutput('feat-1', cwd).tasks, cwd))
      .toThrow(/Feature not found/);
  });
});
