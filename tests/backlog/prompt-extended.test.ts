import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));
vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:path')>();
  return actual;
});

beforeEach(() => {
  vi.resetModules();
  mockExistsSync.mockReset().mockReturnValue(false);
  mockReadFileSync.mockReset().mockReturnValue('');
});

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feat-1',
    title: 'My Feature',
    tool: 'claude' as const,
    effort: 'medium' as const,
    dependsOn: [],
    tasks: [],
    ...overrides,
  };
}

function makeSkill(template: string, inputs?: string[]) {
  return {
    name: 'test-skill',
    source: 'builtin' as const,
    promptTemplate: template,
    metadata: { description: 'test', ...(inputs ? { inputs } : {}) },
  };
}

describe('buildPrompt — string literals and conditionals', () => {
  it('includes "Feature summary:" prefix when spec is present', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ spec: 'My spec text' });
    const result = buildPrompt(feature as never, [makeSkill('{{summary}}')], '/cwd');
    expect(result).toContain('Feature summary:\nMy spec text');
  });

  it('does not include "Feature summary:" when spec is absent', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ spec: undefined });
    const result = buildPrompt(feature as never, [makeSkill('{{summary}}')], '/cwd');
    expect(result).not.toContain('Feature summary:');
  });

  it('includes specFile header with "--- path ---" when file exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('spec file content');
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ specFile: 'specs/f.md' });
    const result = buildPrompt(feature as never, [makeSkill('{{spec}}')], '/cwd');
    expect(result).toContain('--- specs/f.md ---');
    expect(result).toContain('spec file content');
  });

  it('does not include specFile when file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ specFile: 'missing.md' });
    const result = buildPrompt(feature as never, [makeSkill('{{spec}}')], '/cwd');
    expect(result).not.toContain('--- missing.md ---');
  });

  it('includes context file content with "--- file ---" header', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('context content');
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ context: ['src/main.ts'] });
    const result = buildPrompt(feature as never, [makeSkill('{{context}}')], '/cwd');
    expect(result).toContain('--- src/main.ts ---');
    expect(result).toContain('context content');
  });

  it('skips context files that do not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ context: ['missing.ts'] });
    const result = buildPrompt(feature as never, [makeSkill('{{context}}')], '/cwd');
    expect(result).not.toContain('--- missing.ts ---');
  });

  it('includes task with "## id — title" header format', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({
      tasks: [{ id: 't1', title: 'Do something', status: 'todo', skills: [], dependsOn: [] }],
    });
    const result = buildPrompt(feature as never, [makeSkill('{{tasks}}')], '/cwd');
    expect(result).toContain('## t1 — Do something');
  });

  it('includes "Status: " line for non-todo task', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({
      tasks: [{ id: 't1', title: 'Done task', status: 'done', skills: [], dependsOn: [] }],
    });
    const result = buildPrompt(feature as never, [makeSkill('{{tasks}}')], '/cwd');
    expect(result).toContain('Status: done');
  });

  it('does NOT include "Status: " line for todo task', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({
      tasks: [{ id: 't1', title: 'Todo task', status: 'todo', skills: [], dependsOn: [] }],
    });
    const result = buildPrompt(feature as never, [makeSkill('{{tasks}}')], '/cwd');
    expect(result).not.toContain('Status:');
  });

  it('includes "Skills: " line when task has skills', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({
      tasks: [{ id: 't1', title: 'Task', status: 'todo', skills: ['implement', 'test'], dependsOn: [] }],
    });
    const result = buildPrompt(feature as never, [makeSkill('{{tasks}}')], '/cwd');
    expect(result).toContain('Skills: implement, test');
  });

  it('does NOT include "Skills: " line when task has no skills', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({
      tasks: [{ id: 't1', title: 'Task', status: 'todo', skills: [], dependsOn: [] }],
    });
    const result = buildPrompt(feature as never, [makeSkill('{{tasks}}')], '/cwd');
    expect(result).not.toContain('Skills:');
  });

  it('includes "Depends on: " line when task has deps', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({
      tasks: [{ id: 't2', title: 'Task', status: 'todo', skills: [], dependsOn: ['t1'] }],
    });
    const result = buildPrompt(feature as never, [makeSkill('{{tasks}}')], '/cwd');
    expect(result).toContain('Depends on: t1');
  });

  it('does NOT include "Depends on: " when task has no deps', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({
      tasks: [{ id: 't1', title: 'Task', status: 'todo', skills: [], dependsOn: [] }],
    });
    const result = buildPrompt(feature as never, [makeSkill('{{tasks}}')], '/cwd');
    expect(result).not.toContain('Depends on:');
  });

  it('includes taskFile content with "--- path ---" header', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('task content');
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({
      tasks: [{ id: 't1', title: 'Task', status: 'todo', skills: [], dependsOn: [], taskFile: 'tasks/t1.md' }],
    });
    const result = buildPrompt(feature as never, [makeSkill('{{tasks}}')], '/cwd');
    expect(result).toContain('--- tasks/t1.md ---');
    expect(result).toContain('task content');
  });

  it('uses fallback IMPLEMENT skill when skills array is empty', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ id: 'feat-x', title: 'X Feature' });
    const result = buildPrompt(feature as never, [], '/cwd');
    expect(result).toContain('feat-x');
    expect(result).toContain('X Feature');
  });

  it('separates multiple skills with "\\n\\n---\\n\\n"', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const skills = [makeSkill('Skill A'), { ...makeSkill('Skill B'), name: 'b' }];
    const result = buildPrompt(makeFeature() as never, skills, '/cwd');
    expect(result).toContain('\n\n---\n\n');
  });

  it('truncates specFile content when maxContextChars is set', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('A'.repeat(1000));
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ specFile: 'spec.md' });
    const result = buildPrompt(feature as never, [makeSkill('{{spec}}')], '/cwd', { maxContextChars: 50 });
    expect(result).toContain('[truncated to respect promptContextCharLimit]');
  });

  it('does not truncate when content is within maxContextChars', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('Short content');
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ specFile: 'spec.md' });
    const result = buildPrompt(feature as never, [makeSkill('{{spec}}')], '/cwd', { maxContextChars: 1000 });
    expect(result).not.toContain('[truncated');
    expect(result).toContain('Short content');
  });

  it('omits summary from skill when inputs does not include summary', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ spec: 'My spec' });
    const skill = makeSkill('{{summary}}', ['specFile']); // no 'summary' in inputs
    const result = buildPrompt(feature as never, [skill], '/cwd');
    expect(result).not.toContain('Feature summary:');
  });

  it('omits spec from skill when inputs does not include specFile', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('file content');
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ specFile: 'spec.md' });
    const skill = makeSkill('{{spec}}', ['summary']); // no 'specFile' in inputs
    const result = buildPrompt(feature as never, [skill], '/cwd');
    expect(result).not.toContain('file content');
  });

  it('omits context when inputs does not include context', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('ctx content');
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const feature = makeFeature({ context: ['ctx.ts'] });
    const skill = makeSkill('{{context}}', ['summary']); // no 'context' in inputs
    const result = buildPrompt(feature as never, [skill], '/cwd');
    expect(result).not.toContain('ctx content');
  });

  it('normalizes multiple consecutive blank lines to double newline', async () => {
    const { buildPrompt } = await import('../../src/core/backlog/prompt.js');
    const skill = makeSkill('Line 1\n\n\n\nLine 2');
    const result = buildPrompt(makeFeature() as never, [skill], '/cwd');
    expect(result).not.toMatch(/\n{3,}/);
  });
});
