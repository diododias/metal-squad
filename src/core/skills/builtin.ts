import type { Skill } from './types.js';

export const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'implement',
    source: 'builtin',
    promptTemplate: 'Execute the implementation workflow for the selected feature.',
    metadata: {
      description: 'Default implementation workflow.',
      outputs: ['code'],
    },
  },
  {
    name: 'review',
    source: 'builtin',
    promptTemplate: 'Review the generated code and surface concrete findings.',
    metadata: {
      description: 'Code review workflow focused on defects and risks.',
      outputs: ['review'],
    },
  },
  {
    name: 'test',
    source: 'builtin',
    promptTemplate: 'Generate and run the relevant automated tests.',
    metadata: {
      description: 'Testing workflow for validation and regression coverage.',
      outputs: ['tests'],
    },
  },
];
