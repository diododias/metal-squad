import type { RunSummary, StatsRunRow } from '../../../db/repo.js';
import type { WorkItemCatalogEntry } from '../../../ui/catalog.js';
import type { MsqWebState } from '../../types.js';

interface Scoped { featureId: string }

/** Client presentation selector. The catalog is produced by the DB scoped
 * read-model; this prevents an absent selection from becoming "all projects". */
export function isInActiveProject(state: Pick<MsqWebState, 'projects' | 'featureCatalog'>, activeProjectId: string | null, item: Scoped): boolean {
  const projects = (state as { projects?: MsqWebState['projects'] }).projects ?? [];
  if (projects.length === 0) return true;
  if (activeProjectId === null) return false;
  return state.featureCatalog[item.featureId]?.projectId === activeProjectId;
}

export function scopedRuns(state: Pick<MsqWebState, 'projects' | 'featureCatalog' | 'runs'>, activeProjectId: string | null): RunSummary[] {
  return state.runs.filter((run) => isInActiveProject(state, activeProjectId, run));
}

export function scopedFeatures(state: Pick<MsqWebState, 'projects' | 'featureCatalog'>, activeProjectId: string | null, features: WorkItemCatalogEntry[]): WorkItemCatalogEntry[] {
  return features.filter((feature) => isInActiveProject(state, activeProjectId, { featureId: feature.id }));
}

export function scopedStatsRows(state: Pick<MsqWebState, 'projects' | 'featureCatalog'>, activeProjectId: string | null, rows: StatsRunRow[]): StatsRunRow[] {
  return rows.filter((row) => isInActiveProject(state, activeProjectId, row));
}
