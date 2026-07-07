import { describe, it, expect, beforeEach, vi } from 'vitest';

// Dynamic imports so Stryker's perTest coverage attributes module body to tests
beforeEach(() => { vi.resetModules(); });

describe('BUILTIN_SKILLS', () => {
  it('exports an array with implement, review, test, decompose entries', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    const names = BUILTIN_SKILLS.map((s) => s.name);
    expect(names).toContain('implement');
    expect(names).toContain('review');
    expect(names).toContain('test');
    expect(names).toContain('decompose');
  });

  it('has exactly 4 builtin skills', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    expect(BUILTIN_SKILLS).toHaveLength(4);
  });

  it('all skills have source = builtin', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.source).toBe('builtin');
    }
  });

  it('all skills have non-empty promptTemplate', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.promptTemplate.length).toBeGreaterThan(0);
    }
  });

  it('all skills have metadata.description', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    for (const skill of BUILTIN_SKILLS) {
      expect(typeof skill.metadata.description).toBe('string');
      expect(skill.metadata.description!.length).toBeGreaterThan(0);
    }
  });

  it('implement skill template includes expected placeholders', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'implement')!;
    expect(skill.promptTemplate).toContain('{{featureId}}');
    expect(skill.promptTemplate).toContain('{{featureTitle}}');
    expect(skill.promptTemplate).toContain('{{summary}}');
    expect(skill.promptTemplate).toContain('{{spec}}');
    expect(skill.promptTemplate).toContain('{{context}}');
    expect(skill.promptTemplate).toContain('{{tasks}}');
  });

  it('decompose skill template includes output contract', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'decompose')!;
    expect(skill.promptTemplate).toContain('.msq/generated/');
    expect(skill.promptTemplate).toContain('decompose.yaml');
  });

  it('review skill describes its purpose', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'review')!;
    expect(skill.promptTemplate.toLowerCase()).toContain('review');
    expect(skill.metadata.description!.toLowerCase()).toContain('review');
  });

  it('test skill references automated tests', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'test')!;
    expect(skill.promptTemplate.toLowerCase()).toContain('test');
  });

  it('implement skill metadata lists expected inputs', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    const skill = BUILTIN_SKILLS.find((s) => s.name === 'implement')!;
    expect(skill.metadata.inputs).toContain('summary');
    expect(skill.metadata.inputs).toContain('specFile');
    expect(skill.metadata.inputs).toContain('context');
    expect(skill.metadata.inputs).toContain('tasks');
  });

  it('each builtin skill has name, source, promptTemplate, and metadata', async () => {
    const { BUILTIN_SKILLS } = await import('../../src/core/skills/builtin.js');
    for (const skill of BUILTIN_SKILLS) {
      expect(typeof skill.name).toBe('string');
      expect(typeof skill.source).toBe('string');
      expect(typeof skill.promptTemplate).toBe('string');
      expect(typeof skill.metadata).toBe('object');
    }
  });
});
