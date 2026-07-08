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
  {
    name: 'decompose',
    source: 'builtin',
    promptTemplate: [
      'Analyze feature {{featureId}} ({{featureTitle}}) and decompose it into small, atomic tasks.',
      '{{summary}}',
      '{{spec}}',
      '{{context}}',
      '{{tasks}}',
      [
        'Sizing heuristics (apply all of them):',
        '- Count the files that must be touched; a task should touch at most ~3 files.',
        '- Weigh spec complexity: number of requirements, edge cases, and acceptance criteria.',
        '- Flag external dependencies (APIs, DB migrations, new packages) as separate tasks.',
        '- Each task must be completable by an agent in under ~30 minutes.',
      ].join('\n'),
      [
        'Output contract (mandatory):',
        'Write ONLY a YAML file to .msq/generated/{{featureId}}/decompose.yaml with this shape:',
        'tasks:',
        '  - id: task-01',
        '    title: <short imperative title>',
        '    skills: [implement]',
        '    estimate:',
        '      tokens: ~15k',
        '      duration: ~5min',
        '      files: [path/to/file.ts]',
        '    dependsOn: []',
        'Task ids must be sequential (task-01, task-02, ...), dependsOn may only reference ids from this list, and the YAML must be valid.',
      ].join('\n'),
    ].join('\n\n'),
    metadata: {
      description: 'Estimate feature complexity and decompose it into atomic backlog tasks.',
      inputs: ['summary', 'specFile', 'context', 'tasks'],
      outputs: ['tasks'],
    },
  },
];
