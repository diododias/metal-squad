import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKLOG_FILE, loadBacklog } from '../core/backlog/load.js';
import type { Budget, Retry, Task, Workflow } from '../core/backlog/schema.js';

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
  /** F31 section 5b: feature ids this one depends on (dependsOn). */
  dependsOn: string[];
  /** F31 section 5b: fully resolved (defaults applied by zod) workflow config. */
  workflow: Workflow;
  /** F31 section 5b: retry policy — undefined means the feature declared none
   * (callers should resolve against RetrySchema's own defaults to show what
   * would actually apply, not a blank field). */
  retry?: Retry;
  specFile?: string;
  context?: string[];
}

/** F31 section 5b: backlog-level settings shown alongside per-feature config
 * (budget and stageSkills live on the backlog/defaults, not per feature). */
export interface BacklogSettings {
  budget?: Budget;
  stageSkills: Record<string, string[]>;
}

const DEFAULT_BACKLOG_SETTINGS: BacklogSettings = { stageSkills: {} };

function truncateDescription(text: string): string {
  if (text.length <= DESCRIPTION_CHAR_LIMIT) return text;
  return `${text.slice(0, DESCRIPTION_CHAR_LIMIT)}\n... (truncated, ${String(text.length)} chars total)`;
}

function readFeatureDescription(
  spec: string | undefined,
  specFile: string | undefined,
  cwd: string,
): string | null {
  if (spec?.trim()) return truncateDescription(spec.trim());
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
let cachedSettings: BacklogSettings = DEFAULT_BACKLOG_SETTINGS;

function loadCatalogAndSettings(cwd: string): void {
  const backlogPath = resolve(cwd, BACKLOG_FILE);
  if (!existsSync(backlogPath)) {
    cachedPath = backlogPath;
    cachedMtimeMs = 0;
    cachedCatalog = {};
    cachedSettings = DEFAULT_BACKLOG_SETTINGS;
    return;
  }

  const mtimeMs = statSync(backlogPath).mtimeMs;
  if (cachedPath === backlogPath && cachedMtimeMs === mtimeMs) return;

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
            tasks: feature.tasks,
            dependsOn: feature.dependsOn,
            workflow: feature.workflow,
            retry: feature.retry,
            specFile: feature.specFile,
            context: feature.context,
          } satisfies FeatureCatalogEntry,
        ]),
      ),
    );
    cachedSettings = {
      budget: backlog.budget,
      stageSkills: 'defaults' in backlog ? backlog.defaults.stageSkills : {},
    };
  } catch {
    cachedCatalog = {};
    cachedSettings = DEFAULT_BACKLOG_SETTINGS;
  }

  cachedPath = backlogPath;
  cachedMtimeMs = mtimeMs;
}

export function getFeatureCatalog(cwd = process.cwd()): Record<string, FeatureCatalogEntry> {
  loadCatalogAndSettings(cwd);
  return cachedCatalog;
}

export function getBacklogSettings(cwd = process.cwd()): BacklogSettings {
  loadCatalogAndSettings(cwd);
  return cachedSettings;
}

export function getPendingFeatures(
  catalog: Record<string, FeatureCatalogEntry>,
  doneFeatureIds: Set<string>,
  activeFeatureIds: Set<string>,
): FeatureCatalogEntry[] {
  return Object.values(catalog).filter((f) => !doneFeatureIds.has(f.id) && !activeFeatureIds.has(f.id));
}
