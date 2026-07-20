import { describe, expect, it } from 'vitest';
import { isInActiveProject, scopedFeatures, scopedRuns, scopedStatsRows } from '../../src/web/client/lib/scope.js';
import type { MsqWebState } from '../../src/web/types.js';
import type { WorkItemCatalogEntry } from '../../src/ui/catalog.js';
import type { RunSummary, StatsRunRow } from '../../src/db/repo.js';

function catalogEntry(id: string, projectId: string | null): WorkItemCatalogEntry {
  return {
    id,
    title: id,
    projectId,
    repoId: null,
    repoLabel: null,
    workItemType: 'feature',
    skills: [],
    tool: 'claude',
    effort: 'medium',
    dependsOn: [],
    workflow: {
      mode: 'staged',
      stages: ['specify'],
      approvals: { channel: 'telegram', autoAdvance: false },
      autoAdvance: false,
      syncTasksToBacklog: true,
      sessionPolicy: { mode: 'isolated', alwaysIsolatedStages: [] },
    },
  } as unknown as WorkItemCatalogEntry;
}

function stateWithProjects(projects: MsqWebState['projects'], featureCatalog: Record<string, WorkItemCatalogEntry>): Pick<MsqWebState, 'projects' | 'featureCatalog'> {
  return { projects, featureCatalog };
}

describe('isInActiveProject', () => {
  it('shows everything when the catalog has no Projects at all', () => {
    const state = stateWithProjects([], { 'feat-1': catalogEntry('feat-1', null) });
    expect(isInActiveProject(state, null, { featureId: 'feat-1' })).toBe(true);
    expect(isInActiveProject(state, 'project-a', { featureId: 'feat-1' })).toBe(true);
  });

  it('treats a null active selection as mandatory-selection (nothing visible) when Projects exist', () => {
    const state = stateWithProjects(
      [{ projectId: 'project-a', name: 'A', position: 0, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null }],
      { 'feat-1': catalogEntry('feat-1', 'project-a') },
    );
    expect(isInActiveProject(state, null, { featureId: 'feat-1' })).toBe(false);
  });

  it('matches only items whose feature belongs to the active Project', () => {
    const state = stateWithProjects(
      [
        { projectId: 'project-a', name: 'A', position: 0, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null },
        { projectId: 'project-b', name: 'B', position: 1, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null },
      ],
      {
        'feat-a': catalogEntry('feat-a', 'project-a'),
        'feat-b': catalogEntry('feat-b', 'project-b'),
      },
    );
    expect(isInActiveProject(state, 'project-a', { featureId: 'feat-a' })).toBe(true);
    expect(isInActiveProject(state, 'project-a', { featureId: 'feat-b' })).toBe(false);
    expect(isInActiveProject(state, 'project-b', { featureId: 'feat-b' })).toBe(true);
  });

  it('excludes an item whose featureId is missing from the catalog entirely', () => {
    const state = stateWithProjects(
      [{ projectId: 'project-a', name: 'A', position: 0, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null }],
      {},
    );
    expect(isInActiveProject(state, 'project-a', { featureId: 'ghost' })).toBe(false);
  });
});

describe('scopedRuns / scopedFeatures / scopedStatsRows', () => {
  const projects: MsqWebState['projects'] = [
    { projectId: 'project-a', name: 'A', position: 0, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null },
    { projectId: 'project-b', name: 'B', position: 1, description: null, revision: 1, counts: { epics: 0, workItems: 0, archived: 0 }, activeRuns: 0, tokens: { status: 'ready', totalTokens: 0, error: null }, archivedAt: null },
  ];
  const featureCatalog = {
    'feat-a': catalogEntry('feat-a', 'project-a'),
    'feat-b': catalogEntry('feat-b', 'project-b'),
  };

  it('filters runs down to the active Project', () => {
    const runs = [
      { runId: 1, featureId: 'feat-a' },
      { runId: 2, featureId: 'feat-b' },
    ] as unknown as RunSummary[];
    const state = { projects, featureCatalog, runs };
    expect(scopedRuns(state, 'project-a').map((r) => r.runId)).toEqual([1]);
    expect(scopedRuns(state, 'project-b').map((r) => r.runId)).toEqual([2]);
  });

  it('filters catalog features down to the active Project', () => {
    const state = { projects, featureCatalog };
    const features = [catalogEntry('feat-a', 'project-a'), catalogEntry('feat-b', 'project-b')];
    expect(scopedFeatures(state, 'project-a', features).map((f) => f.id)).toEqual(['feat-a']);
  });

  it('filters stats rows down to the active Project', () => {
    const rows = [
      { id: 1, featureId: 'feat-a' },
      { id: 2, featureId: 'feat-b' },
    ] as unknown as StatsRunRow[];
    const state = { projects, featureCatalog };
    expect(scopedStatsRows(state, 'project-b', rows).map((r) => r.id)).toEqual([2]);
  });

  it('returns an empty set for every helper when no Project is selected but Projects exist', () => {
    const state = { projects, featureCatalog, runs: [{ runId: 1, featureId: 'feat-a' }] as unknown as RunSummary[] };
    expect(scopedRuns(state, null)).toEqual([]);
    expect(scopedFeatures(state, null, [catalogEntry('feat-a', 'project-a')])).toEqual([]);
    expect(scopedStatsRows(state, null, [{ id: 1, featureId: 'feat-a' } as unknown as StatsRunRow])).toEqual([]);
  });
});
