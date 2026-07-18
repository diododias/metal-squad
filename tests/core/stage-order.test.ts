import { describe, expect, it } from 'vitest';
import { STAGE_ORDER } from '../../src/core/workflow/stageOrder.js';
import { DEFAULT_PROJECT_TEMPLATE } from '../../src/core/workflow/stageSkills.js';

describe('STAGE_ORDER', () => {
  it('is the single default used by the project template', () => {
    expect(DEFAULT_PROJECT_TEMPLATE.stages).toEqual(STAGE_ORDER);
  });
});
