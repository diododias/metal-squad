import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectBacklogSkillNames, formatSkillList, validateBacklogSkills } from '../../src/core/skills/index.js';
import { createSkillRegistry } from '../../src/core/skills/registry.js';
import type { BacklogV2 } from '../../src/core/backlog/schema.js';

function createSkillDir(
  root: string,
  name: string,
  prompt = `# ${name}\n`,
  metadata?: string,
): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), prompt);
  if (metadata) writeFileSync(join(dir, 'metadata.yaml'), metadata);
  return dir;
}

describe('skill registry', () => {
  const previousHome = process.env.HOME;
  let cwd = '';
  let home = '';

  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    if (home) rmSync(home, { recursive: true, force: true });
    process.env.HOME = previousHome;
    cwd = '';
    home = '';
  });

  it('discovers builtin, repo, global, and external skills', () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-skills-cwd-'));
    home = mkdtempSync(join(tmpdir(), 'msq-skills-home-'));
    process.env.HOME = home;

    createSkillDir(join(cwd, '.msq/skills'), 'decompose', '# repo\n', 'description: Repo skill\n');
    createSkillDir(
      join(home, '.config/metal-squad/skills'),
      'global-review',
      '# global\n',
      'description: Global skill\n',
    );
    createSkillDir(
      join(cwd, '.agents/skills'),
      'speckit-plan',
      '# external\n',
      'description: Spec Kit plan\n',
    );
    mkdirSync(join(cwd, '.specify'), { recursive: true });

    const registry = createSkillRegistry();
    const skills = registry.discover(cwd);

    expect(skills.some((skill) => skill.name === 'review' && skill.source === 'builtin')).toBe(true);
    expect(skills.some((skill) => skill.name === 'decompose' && skill.source === 'repo')).toBe(true);
    expect(skills.some((skill) => skill.name === 'global-review' && skill.source === 'global')).toBe(true);
    expect(skills.some((skill) => skill.name === 'plan' && skill.source === 'external')).toBe(true);
    expect(skills.some((skill) => skill.name === 'tasks' && skill.source === 'external')).toBe(true);
  });

  it('applies defaults when metadata.yaml is absent', () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-skills-defaults-'));
    home = mkdtempSync(join(tmpdir(), 'msq-skills-home-'));
    process.env.HOME = home;

    createSkillDir(join(cwd, '.msq/skills'), 'custom');

    const registry = createSkillRegistry();
    const skill = registry.discover(cwd).find((item) => item.name === 'custom');

    expect(skill?.metadata.description).toBe('custom skill discovered from repo.');
  });

  it('prefers repo skills over builtin skills during resolution', () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-skills-priority-'));
    home = mkdtempSync(join(tmpdir(), 'msq-skills-home-'));
    process.env.HOME = home;

    createSkillDir(
      join(cwd, '.msq/skills'),
      'implement',
      '# repo implement\n',
      'description: Repo implement\n',
    );

    const registry = createSkillRegistry();
    const [skill] = registry.resolve(['implement'], cwd);

    expect(skill?.source).toBe('repo');
    expect(skill?.metadata.description).toBe('Repo implement');
  });
});

describe('backlog skill validation', () => {
  const previousHome = process.env.HOME;
  let cwd = '';
  let home = '';

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
            id: 'feat-02',
            title: 'Skill Registry',
            tool: 'claude',
            effort: 'medium',
            dependsOn: [],
            tasks: [
              {
                id: 'task-1',
                title: 'Validation',
                dependsOn: [],
                skills: ['plan'],
                status: 'todo',
              },
            ],
            skills: ['implement', 'review'],
          },
        ],
      },
    ],
  };

  afterEach(() => {
    if (cwd) rmSync(cwd, { recursive: true, force: true });
    if (home) rmSync(home, { recursive: true, force: true });
    process.env.HOME = previousHome;
    cwd = '';
    home = '';
  });

  it('collects distinct skill names from defaults, features, and tasks', () => {
    expect(collectBacklogSkillNames(backlog).sort()).toEqual(['implement', 'plan', 'review']);
  });

  it('fails fast when the backlog references a missing skill', () => {
    cwd = mkdtempSync(join(tmpdir(), 'msq-backlog-cwd-'));
    home = mkdtempSync(join(tmpdir(), 'msq-backlog-home-'));
    process.env.HOME = home;

    expect(() => validateBacklogSkills(backlog, cwd)).toThrow(
      'Missing skills referenced in backlog: plan',
    );
  });
});

describe('skill list formatting', () => {
  it('includes name, source, and description', () => {
    const output = formatSkillList([
      {
        name: 'implement',
        source: 'builtin',
        promptTemplate: 'Implement',
        metadata: { description: 'Default implementation workflow.' },
      },
      {
        name: 'plan',
        source: 'external',
        promptTemplate: 'Plan',
        metadata: { description: 'Spec Kit plan' },
      },
    ]);

    expect(output).toContain('NAME');
    expect(output).toContain('SOURCE');
    expect(output).toContain('implement');
    expect(output).toContain('builtin');
    expect(output).toContain('Spec Kit plan');
  });
});
