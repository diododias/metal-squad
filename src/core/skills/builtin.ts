import type { Skill } from './types.js';

export const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'implement',
    source: 'builtin',
    promptTemplate: [
      'Implement {{featureId}} ({{featureTitle}}).',
      '{{summary}}',
      '{{spec}}',
      '{{context}}',
      '{{tasks}}',
    ].join('\n\n'),
    metadata: {
      description: 'Default implementation workflow.',
      inputs: ['summary', 'specFile', 'context', 'tasks'],
      outputs: ['code'],
    },
  },
  {
    name: 'review',
    source: 'builtin',
    promptTemplate: [
      'Review the work for {{featureId}} ({{featureTitle}}) and surface concrete findings.',
      '{{summary}}',
      '{{spec}}',
      '{{context}}',
      '{{tasks}}',
    ].join('\n\n'),
    metadata: {
      description: 'Code review workflow focused on defects and risks.',
      inputs: ['summary', 'specFile', 'context', 'tasks'],
      outputs: ['review'],
    },
  },
  {
    name: 'test',
    source: 'builtin',
    promptTemplate: [
      'Generate and run the relevant automated tests for {{featureId}} ({{featureTitle}}).',
      '{{summary}}',
      '{{spec}}',
      '{{context}}',
      '{{tasks}}',
    ].join('\n\n'),
    metadata: {
      description: 'Testing workflow for validation and regression coverage.',
      inputs: ['summary', 'specFile', 'context', 'tasks'],
      outputs: ['tests'],
    },
  },
];
