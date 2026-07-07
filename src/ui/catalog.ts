import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKLOG_FILE, loadBacklog } from '../core/backlog/load.js';

export interface FeatureCatalogEntry {
  id: string;
  title: string;
  skills: string[];
  tool: string;
}

let cachedPath = '';
let cachedCatalog: Record<string, FeatureCatalogEntry> = {};

export function getFeatureCatalog(cwd = process.cwd()): Record<string, FeatureCatalogEntry> {
  const backlogPath = resolve(cwd, BACKLOG_FILE);
  if (cachedPath === backlogPath) return cachedCatalog;
  if (!existsSync(backlogPath)) {
    cachedPath = backlogPath;
    cachedCatalog = {};
    return cachedCatalog;
  }

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
          } satisfies FeatureCatalogEntry,
        ]),
      ),
    );
  } catch {
    cachedCatalog = {};
  }

  cachedPath = backlogPath;
  return cachedCatalog;
}
