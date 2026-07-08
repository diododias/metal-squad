import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockReaddirSync = vi.fn();
const mockHomedir = vi.fn(() => '/home/user');
const mockParse = vi.fn();

const MOCK_BUILTIN: Array<{ name: string; source: string; promptTemplate: string; metadata: Record<string, unknown> }> = [
  { name: 'implement', source: 'builtin', promptTemplate: 'implement prompt', metadata: { description: 'Implement feature' } },
  { name: 'review', source: 'builtin', promptTemplate: 'review prompt', metadata: { description: 'Review code' } },
];

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
}));
vi.mock('node:os', () => ({ homedir: mockHomedir }));
vi.mock('yaml', () => ({ parse: mockParse }));
vi.mock('../../src/core/skills/builtin.js', () => ({ BUILTIN_SKILLS: MOCK_BUILTIN }));

beforeEach(() => {
  vi.resetModules();
  mockExistsSync.mockReset().mockReturnValue(false);
  mockReadFileSync.mockReset().mockReturnValue('');
  mockReaddirSync.mockReset().mockReturnValue([]);
  mockParse.mockReset().mockReturnValue(null);
  mockHomedir.mockReturnValue('/home/user');
});

describe('createSkillRegistry — discover', () => {
  it('returns builtin skills when no local directories exist', async () => {
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const names = skills.map((s) => s.name);
    expect(names).toContain('implement');
    expect(names).toContain('review');
  });

  it('discovers skills from .msq/skills directory', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('.msq/skills') || p.endsWith('SKILL.md'));
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.msq/skills')) return [{ name: 'custom-skill', isDirectory: () => true }];
      return [];
    });
    mockReadFileSync.mockReturnValue('custom skill content');
    mockParse.mockReturnValue(null);

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const names = skills.map((s) => s.name);
    expect(names).toContain('custom-skill');
  });

  it('assigns source=repo to .msq/skills discoveries', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('.msq/skills') || p.endsWith('SKILL.md'));
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.msq/skills')) return [{ name: 'my-skill', isDirectory: () => true }];
      return [];
    });
    mockReadFileSync.mockReturnValue('prompt');
    mockParse.mockReturnValue(null);

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const repoSkill = skills.find((s) => s.name === 'my-skill');
    expect(repoSkill?.source).toBe('repo');
  });

  it('discovers global skills from ~/.config/metal-squad/skills', async () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('.config/metal-squad/skills') || p.endsWith('SKILL.md'),
    );
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.config/metal-squad/skills')) {
        return [{ name: 'global-skill', isDirectory: () => true }];
      }
      return [];
    });
    mockReadFileSync.mockReturnValue('global prompt');

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const found = skills.find((s) => s.name === 'global-skill');
    expect(found?.source).toBe('global');
  });

  it('repo skill takes priority over builtin when same name', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('.msq/skills') || p.endsWith('SKILL.md'));
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.msq/skills')) return [{ name: 'implement', isDirectory: () => true }];
      return [];
    });
    mockReadFileSync.mockReturnValue('repo override prompt');

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const impl = skills.find((s) => s.name === 'implement')!;
    expect(impl.source).toBe('repo');
  });

  it('returns empty array when .msq/skills does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    // Only builtins
    expect(skills.every((s) => s.source === 'builtin')).toBe(true);
  });

  it('skips non-directory entries in skills folder', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('.msq/skills'));
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.msq/skills')) return [
        { name: 'not-a-dir.md', isDirectory: () => false },
        { name: 'real-skill', isDirectory: () => true },
      ];
      return [];
    });
    // real-skill has no SKILL.md
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('.msq/skills') && !p.endsWith('SKILL.md'),
    );

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    expect(skills.find((s) => s.name === 'not-a-dir.md')).toBeUndefined();
    expect(skills.find((s) => s.name === 'real-skill')).toBeUndefined(); // no SKILL.md
  });

  it('returns null for directory without SKILL.md', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('.msq/skills') && !p.endsWith('SKILL.md'));
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.msq/skills')) return [{ name: 'no-prompt', isDirectory: () => true }];
      return [];
    });

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    expect(skills.find((s) => s.name === 'no-prompt')).toBeUndefined();
  });

  it('discovers spec-kit skills from .agents/skills/speckit- directories', async () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('.agents/skills') || p.endsWith('SKILL.md'),
    );
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.agents/skills')) return [
        { name: 'speckit-specify', isDirectory: () => true },
      ];
      return [];
    });
    mockReadFileSync.mockReturnValue('specify skill prompt');

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const specSkill = skills.find((s) => s.name === 'specify');
    expect(specSkill).toBeDefined();
    expect(specSkill?.source).toBe('external');
    expect(specSkill?.name).toBe('specify'); // name without speckit- prefix
  });

  it('treats non-speckit directories in .agents/skills as legacy repo skills', async () => {
    mockExistsSync.mockImplementation((p: string) => p.includes('.agents/skills') || p.endsWith('SKILL.md'));
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.agents/skills')) return [
        { name: 'other-skill', isDirectory: () => true },
        { name: 'speckit-plan', isDirectory: () => true },
      ];
      return [];
    });
    mockReadFileSync.mockReturnValue('prompt');

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    expect(skills.find((s) => s.name === 'other-skill')?.source).toBe('repo');
    expect(skills.find((s) => s.name === 'plan')).toBeDefined();
  });

  it('adds spec-kit fallback skills when .specify directory exists', async () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('.specify'));
    mockReaddirSync.mockReturnValue([]);

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const specSkill = skills.find((s) => s.name === 'specify');
    expect(specSkill).toBeDefined();
    expect(specSkill?.source).toBe('external');
    expect(specSkill?.promptTemplate).toContain('Spec Kit');
  });

  it('does not add fallback skills for names already discovered from speckit dirs', async () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('.agents/skills') || p.endsWith('.specify') || p.endsWith('SKILL.md'),
    );
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.agents/skills')) return [
        { name: 'speckit-specify', isDirectory: () => true },
      ];
      return [];
    });
    mockReadFileSync.mockReturnValue('custom specify prompt from dir');

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const specifySkills = skills.filter((s) => s.name === 'specify');
    expect(specifySkills).toHaveLength(1);
    expect(specifySkills[0]?.promptTemplate).toBe('custom specify prompt from dir');
  });

  it('returns skills sorted alphabetically', async () => {
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const names = skills.map((s) => s.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('reads metadata from metadata.yaml when it exists', async () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('.msq/skills') || p.endsWith('SKILL.md') || p.endsWith('metadata.yaml'),
    );
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.msq/skills')) return [{ name: 'meta-skill', isDirectory: () => true }];
      return [];
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('metadata.yaml')) return 'description: My custom description\ninputs:\n  - summary';
      return 'prompt content';
    });
    mockParse.mockReturnValue({ description: 'My custom description', inputs: ['summary'] });

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const skill = skills.find((s) => s.name === 'meta-skill');
    expect(skill?.metadata.description).toBe('My custom description');
    expect(skill?.metadata.inputs).toContain('summary');
  });

  it('falls back to default description when metadata.yaml is missing', async () => {
    mockExistsSync.mockImplementation((p: string) =>
      p.includes('.msq/skills') || p.endsWith('SKILL.md'),
    );
    mockReaddirSync.mockImplementation((p: string) => {
      if (p.includes('.msq/skills')) return [{ name: 'no-meta', isDirectory: () => true }];
      return [];
    });
    mockReadFileSync.mockReturnValue('prompt');
    // metadata.yaml does not exist (existsSync returns false for it)
    mockExistsSync.mockImplementation((p: string) =>
      (p.includes('.msq/skills') || p.endsWith('SKILL.md')) && !p.endsWith('metadata.yaml'),
    );

    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const skills = registry.discover('/cwd');
    const skill = skills.find((s) => s.name === 'no-meta');
    expect(skill?.metadata.description).toContain('no-meta');
    expect(skill?.metadata.description).toContain('repo');
  });
});

describe('createSkillRegistry — resolve', () => {
  it('returns matching skills by name', async () => {
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const resolved = registry.resolve(['implement'], '/cwd');
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.name).toBe('implement');
  });

  it('returns empty array for unknown skill names', async () => {
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const resolved = registry.resolve(['nonexistent-skill'], '/cwd');
    expect(resolved).toHaveLength(0);
  });

  it('resolves multiple skills by name', async () => {
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const resolved = registry.resolve(['implement', 'review'], '/cwd');
    expect(resolved).toHaveLength(2);
    expect(resolved.map((s) => s.name)).toContain('implement');
    expect(resolved.map((s) => s.name)).toContain('review');
  });
});

describe('createSkillRegistry — validate', () => {
  it('returns valid=true when all skills exist', async () => {
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const result = registry.validate(['implement', 'review'], '/cwd');
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('returns valid=false with missing names when skills are absent', async () => {
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const result = registry.validate(['implement', 'nonexistent'], '/cwd');
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('nonexistent');
    expect(result.missing).not.toContain('implement');
  });

  it('deduplicates missing skill names', async () => {
    const { createSkillRegistry } = await import('../../src/core/skills/registry.js');
    const registry = createSkillRegistry();
    const result = registry.validate(['missing', 'missing', 'missing'], '/cwd');
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toBe('missing');
  });
});
