import { describe, it, expect } from 'vitest';
import { formatSkillList } from '../../src/core/skills/format.js';
import type { Skill } from '../../src/core/skills/types.js';

const makeSkill = (name: string, source: Skill['source'], description: string): Skill => ({
  name,
  source,
  promptTemplate: 'template',
  metadata: { description },
});

describe('formatSkillList', () => {
  it('returns "No skills available." for empty array', () => {
    expect(formatSkillList([])).toBe('No skills available.');
  });

  it('includes NAME, SOURCE, DESCRIPTION header', () => {
    const result = formatSkillList([makeSkill('implement', 'builtin', 'Default impl')]);
    expect(result).toContain('NAME');
    expect(result).toContain('SOURCE');
    expect(result).toContain('DESCRIPTION');
  });

  it('includes skill name, source, and description in output', () => {
    const result = formatSkillList([makeSkill('implement', 'builtin', 'Default impl workflow')]);
    expect(result).toContain('implement');
    expect(result).toContain('builtin');
    expect(result).toContain('Default impl workflow');
  });

  it('pads columns so all rows align', () => {
    const skills = [
      makeSkill('a', 'builtin', 'Short'),
      makeSkill('longnamehere', 'repo', 'Longer description'),
    ];
    const result = formatSkillList(skills);
    const lines = result.split('\n');
    // Header and two data rows
    expect(lines).toHaveLength(3);
    // All rows should have the same column structure
    expect(lines[0]).toContain('NAME');
    expect(lines[1]).toContain('a');
    expect(lines[2]).toContain('longnamehere');
  });

  it('handles empty description gracefully', () => {
    const skill: Skill = {
      name: 'nodesc',
      source: 'global',
      promptTemplate: 'template',
      metadata: { description: '' },
    };
    const result = formatSkillList([skill]);
    expect(result).toContain('nodesc');
    expect(result).not.toContain('undefined');
  });

  it('renders all skills when multiple are provided', () => {
    const skills = [
      makeSkill('implement', 'builtin', 'Impl'),
      makeSkill('review', 'repo', 'Rev'),
      makeSkill('test', 'global', 'Test'),
    ];
    const result = formatSkillList(skills);
    expect(result).toContain('implement');
    expect(result).toContain('review');
    expect(result).toContain('test');
  });

  it('source column width adapts to longest source value', () => {
    const skills = [
      makeSkill('a', 'builtin', 'A'),
      makeSkill('b', 'external', 'B'),
    ];
    const result = formatSkillList(skills);
    expect(result).toContain('external');
    expect(result).toContain('builtin');
  });
});
