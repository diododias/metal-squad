import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_TEMPLATE,
  resolveDefaultStageSkillNames,
} from '../../src/core/workflow/stageSkills.js';

describe('default stage skills', () => {
  it('uses discovered project implementation preferences in their current order', () => {
    const registry = {
      has: (name: string) => ['speckit-implement', 'dev-flow', 'implement'].includes(name),
    };

    expect(resolveDefaultStageSkillNames('implement', registry, '/repo')).toEqual([
      'speckit-implement',
      'dev-flow',
    ]);
  });

  it('falls back to the guaranteed builtin when project preferences are absent', () => {
    const registry = { has: () => false };

    expect(DEFAULT_PROJECT_TEMPLATE.stageSkills.implement).toEqual(['implement']);
    expect(resolveDefaultStageSkillNames('implement', registry, '/minimal-repo')).toEqual(['implement']);
  });
});
