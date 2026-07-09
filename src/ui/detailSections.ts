/**
 * F31 section 5: fixed order of the run-detail scrollable body sections.
 * Shared between App.tsx (scroll index/paging state) and MainPanel.tsx
 * (rendering) so both always agree on how many sections exist and in what
 * order — every section always exists (Feature Config is always shown for
 * an existing feature), so the count never has to be recomputed at runtime.
 */
export type DetailSectionId = 'summary' | 'spec' | 'workflow' | 'config' | 'skills' | 'tasks' | 'output';

export const DETAIL_SECTION_ORDER: DetailSectionId[] = [
  'summary',
  'spec',
  'workflow',
  'config',
  'skills',
  'tasks',
  'output',
];

export const DETAIL_SECTION_LABEL: Record<DetailSectionId, string> = {
  summary: 'Run Summary',
  spec: 'Feature Spec',
  workflow: 'Workflow',
  config: 'Feature Config',
  skills: 'Declared Skills',
  tasks: 'Tasks',
  output: 'Live Output',
};
