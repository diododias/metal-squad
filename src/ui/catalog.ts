import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mergeExecutionDefaults, resolveConfigSnapshot, type ResolvedConfigSources, type ResolvedExecutionDefaults } from '../config/index.js';
import type { ToolCapabilities } from '../core/adapters/types.js';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { resolveRepo } from '../core/repo.js';
import { getCatalogMeta, listCatalogWorkItemRelations } from '../db/backlogCatalog.js';
import { DefaultsSchema, type Budget, type Defaults, type Retry, type Task, type Workflow } from '../core/backlog/schema.js';
import { logCaughtError } from '../core/events/index.js';

const DESCRIPTION_CHAR_LIMIT = 4000;

export interface WorkItemCatalogEntry {
  id: string;
  /** Persistent catalog identity; kept separate from display-only fallbacks. */
  persistedId?: string;
  title: string;
  /** Parent epic identity — surfaced muted on web kanban cards. */
  epicId?: string;
  epicTitle?: string;
  /** Global hierarchy relation. Never inferred from a client-side selection. */
  projectId?: string | null;
  repoId?: string | null;
  repoLabel?: string | null;
  workItemType: 'feature';
  skills: string[];
  tool: string;
  model?: string;
  effort: string;
  thinking?: string;
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

/** Compatibility alias while existing UI call sites migrate to the domain name. */
export type FeatureCatalogEntry = WorkItemCatalogEntry;

/** F31 section 5b: project-level settings shown alongside per-feature config. */
export interface BacklogSettings {
  budget?: Budget;
  stageSkills: Record<string, string[]>;
  toolCapabilities?: Record<string, ToolCapabilities>;
  configSources?: ResolvedConfigSources;
  /** Read-only project execution defaults, used to resolve a feature through
   * the sole Feature -> Project inheritance path. */
  resolvedDefaults?: ResolvedExecutionDefaults;
  /** SET-16: raw project defaults as stored in `backlog_catalog_meta`
   * (`defaults_json`), separate from `resolvedDefaults` — this is the
   * editable shape `action:updateProjectDefaults` patches. Falls back to
   * schema defaults for a project that hasn't loaded a catalog yet. */
  projectDefaults: Defaults;
}

const DEFAULT_TOOL_CAPABILITIES: Record<string, ToolCapabilities> = {
  claude: { model: true, effort: true, thinking: true },
  codex: { model: true, effort: true, thinking: false },
  opencode: { model: true, effort: false, thinking: false },
};

const DEFAULT_BACKLOG_SETTINGS: BacklogSettings = {
  stageSkills: {},
  toolCapabilities: DEFAULT_TOOL_CAPABILITIES,
  projectDefaults: DefaultsSchema.parse({}),
};

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
  } catch (error) {
    logCaughtError('ui/catalog.readFeatureDescription', error);
    return null;
  }
}

let cachedCatalog: Record<string, WorkItemCatalogEntry> = {};
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
    const relations = new Map(
      listCatalogWorkItemRelations(repoId).map((relation) => [relation.featureId, relation]),
    );
    const resolvedDefaults = mergeExecutionDefaults(DefaultsSchema.parse({}), backlog.defaults);
    cachedCatalog = Object.fromEntries(
      backlog.epics.flatMap((epic) =>
        epic.features.map((feature) => {
          const relation = relations.get(feature.id);
          return [
            feature.id,
            {
              id: feature.id,
              persistedId: feature.id,
              title: feature.title,
              epicId: epic.id,
              epicTitle: epic.title,
              projectId: relation?.projectId ?? null,
              repoId: relation?.repoId ?? repoId,
              repoLabel: relation?.repoLabel ?? null,
              workItemType: 'feature' as const,
              skills: feature.skills ?? [],
              tool: feature.tool,
              model: feature.model,
              effort: feature.effort,
              thinking: feature.thinking,
              description: readFeatureDescription(feature.spec, feature.specFile, cwd),
              tasks: feature.tasks,
              dependsOn: feature.dependsOn,
              workflow: feature.workflow,
              retry: feature.retry,
              specFile: feature.specFile,
              context: feature.context,
              maxTokens: feature.maxTokens,
              autoStart: feature.autoStart,
            } satisfies WorkItemCatalogEntry,
          ];
        }),
      ),
    );
    const catalogMeta = getCatalogMeta(repoId);
    const projectDefaults = catalogMeta
      ? DefaultsSchema.parse(JSON.parse(catalogMeta.defaults_json))
      : DefaultsSchema.parse({});

    cachedSettings = {
      budget: backlog.budget,
      stageSkills: backlog.defaults.stageSkills,
      toolCapabilities: DEFAULT_TOOL_CAPABILITIES,
      configSources: snapshot.sources,
      resolvedDefaults,
      projectDefaults,
    };
  } catch (error) {
    logCaughtError('ui/catalog.loadCatalogAndSettings', error);
    cachedCatalog = {};
    cachedSettings = DEFAULT_BACKLOG_SETTINGS;
  }
}

export function getFeatureCatalog(cwd = process.cwd()): Record<string, WorkItemCatalogEntry> {
  loadCatalogAndSettings(cwd);
  return cachedCatalog;
}

export function getBacklogSettings(cwd = process.cwd()): BacklogSettings {
  loadCatalogAndSettings(cwd);
  return cachedSettings;
}

export function getPendingFeatures(
  catalog: Record<string, WorkItemCatalogEntry>,
  doneFeatureIds: Set<string>,
  activeFeatureIds: Set<string>,
): WorkItemCatalogEntry[] {
  return Object.values(catalog)
    .filter((f) => !doneFeatureIds.has(f.id) && !activeFeatureIds.has(f.id))
    .map((feature) => ({
      ...feature,
      pendingDependencies: feature.dependsOn.filter((dependency) => !doneFeatureIds.has(dependency)),
    }));
}
