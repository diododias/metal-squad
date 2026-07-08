import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKLOG_FILE, loadBacklog } from '../core/backlog/load.js';

export interface FeatureCatalogEntry {
  id: string;
  title: string;
  skills: string[];
  tool: string;
  model?: string;
  effort: string;
}

let cachedPath = '';
let cachedMtimeMs = 0;
let cachedCatalog: Record<string, FeatureCatalogEntry> = {};

export function getFeatureCatalog(cwd = process.cwd()): Record<string, FeatureCatalogEntry> {
  const backlogPath = resolve(cwd, BACKLOG_FILE);
  if (!existsSync(backlogPath)) {
    cachedPath = backlogPath;
    cachedMtimeMs = 0;
    cachedCatalog = {};
    return cachedCatalog;
  }

  const mtimeMs = statSync(backlogPath).mtimeMs;
  if (cachedPath === backlogPath && cachedMtimeMs === mtimeMs) return cachedCatalog;

  try {
    const backlog = loadBacklog(BACKLOG_FILE, cwd);
    cachedCatalog = Object.fromEntries(
      backlog.epics.flatMap((epic) =>
        epic.features.map((feature) => [
          feature.id,
          {
            id: feature.id,
            title: feature.title,
            skills: feature.skills ?? [],
            tool: feature.tool,
            model: feature.model,
            effort: feature.effort,
          } satisfies FeatureCatalogEntry,
        ]),
      ),
    );
  } catch {
    cachedCatalog = {};
  }

  cachedPath = backlogPath;
  cachedMtimeMs = mtimeMs;
  return cachedCatalog;
}

export function getPendingFeatures(
  catalog: Record<string, FeatureCatalogEntry>,
  doneFeatureIds: Set<string>,
  activeFeatureIds: Set<string>,
): FeatureCatalogEntry[] {
  return Object.values(catalog).filter((f) => !doneFeatureIds.has(f.id) && !activeFeatureIds.has(f.id));
}
