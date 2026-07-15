import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeExecutionDefaults, resolveConfigSnapshot, type ResolvedConfigSources, type ResolvedExecutionDefaults } from '../config/index.js';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { resolveRepo } from '../core/repo.js';
import type { Budget, Retry, Task, Workflow } from '../core/backlog/schema.js';

const DESCRIPTION_CHAR_LIMIT = 4000;

export interface FeatureCatalogEntry {
  id: string;
  /** Persistent catalog identity; kept separate from display-only fallbacks. */
  persistedId?: string;
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
  /** F36: per-feature config for `budget.perFeatureMaxTokens` — undefined
    * means the backlog-level default still applies. */
  maxTokens?: number;
  /** F45: opt-in auto-pilot flag — when true, feature is eligible for automatic
   * continuation after qualifying outcomes (success, blocked-human, failed-execution). */
  autoStart?: boolean;
  /** Dynamic projection for manual start guardrails. */
  pendingDependencies?: string[];
}

/** F31 section 5b: backlog-level settings shown alongside per-feature config
 * (budget and stageSkills live on the backlog/defaults, not per feature). */
export interface BacklogSettings {
  budget?: Budget;
  stageSkills: Record<string, string[]>;
  configSources?: ResolvedConfigSources;
  resolvedDefaults?: ResolvedExecutionDefaults;
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

let cachedCatalog: Record<string, FeatureCatalogEntry> = {};
let cachedSettings: BacklogSettings = DEFAULT_BACKLOG_SETTINGS;

/** Catalog now lives in the DB (populated by `msq backlog load`) rather than
 * backlog.yaml — see docs/features/F35-backlog-catalog-import.md. Queried
 * fresh on every call (cheap local SQLite read, same pattern as the rest of
 * the TUI's DB-backed state). */
function loadCatalogAndSettings(cwd: string): void {
  try {
    const snapshot = resolveConfigSnapshot(cwd);
    const { repoId } = resolveRepo(cwd);
    const backlog = loadBacklogFromCatalog(repoId, cwd);
    const resolvedDefaults = mergeExecutionDefaults({
      tool: snapshot.repoDefaults.tool ?? 'claude',
      model: snapshot.repoDefaults.model,
      effort: snapshot.repoDefaults.effort ?? 'medium',
      thinking: snapshot.repoDefaults.thinking ?? 'off',
      skills: snapshot.repoDefaults.skills ?? [],
      stageSkills: snapshot.repoDefaults.stageSkills ?? {},
    }, backlog.defaults);
    cachedCatalog = Object.fromEntries(
      backlog.epics.flatMap((epic) =>
        epic.features.map((feature) => [
          feature.id,
          {
            id: feature.id,
            persistedId: feature.id,
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
            maxTokens: feature.maxTokens,
            autoStart: feature.autoStart,
          } satisfies FeatureCatalogEntry,
        ]),
      ),
    );
    cachedSettings = {
      budget: backlog.budget,
      stageSkills: 'defaults' in backlog ? backlog.defaults.stageSkills : {},
      configSources: snapshot.sources,
      resolvedDefaults,
    };
  } catch {
    cachedCatalog = {};
    cachedSettings = DEFAULT_BACKLOG_SETTINGS;
  }
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
  return Object.values(catalog)
    .filter((f) => !doneFeatureIds.has(f.id) && !activeFeatureIds.has(f.id))
    .map((feature) => ({
      ...feature,
      pendingDependencies: feature.dependsOn.filter((dependency) => !doneFeatureIds.has(dependency)),
    }));
}
