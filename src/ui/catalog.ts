import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKLOG_FILE, loadBacklog } from '../core/backlog/load.js';
import type { Task } from '../core/backlog/schema.js';

const DESCRIPTION_CHAR_LIMIT = 4000;

export interface FeatureCatalogEntry {
  id: string;
  title: string;
  skills: string[];
  tool: string;
  model?: string;
  effort: string;
  /** Full spec/feature description (D2): inline `spec` summary, or the
   * content of `specFile` when no inline summary is declared. Truncated to
   * DESCRIPTION_CHAR_LIMIT so it stays readable inside the Ink detail view. */
  description?: string | null;
  /** Declared task breakdown (D4) — the backlog's building blocks for this
   * feature, distinct from live task_runs execution instances. */
  tasks?: Task[];
}

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_CHAR_LIMIT) return text;
  return `${text.slice(0, DESCRIPTION_CHAR_LIMIT)}\n... (truncated, ${text.length} chars total)`;
}

function readFeatureDescription(
  spec: string | undefined,
  specFile: string | undefined,
  cwd: string,
): string | null {
  if (spec && spec.trim()) return truncateDescription(spec.trim());
  if (!specFile) return null;
  try {
    const abs = resolve(cwd, specFile);
    if (!existsSync(abs)) return null;
    const content = readFileSync(abs, 'utf8').trim();
    return content ? truncateDescription(content) : null;
  } catch {
    return null;
  }
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
            description: readFeatureDescription(feature.spec, feature.specFile, cwd),
            tasks: feature.tasks ?? [],
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
