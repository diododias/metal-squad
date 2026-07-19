import { mergeExecutionDefaults, resolveConfigSnapshot, type ResolvedConfigSources, type ResolvedExecutionDefaults } from '../config/index.js';
import type { ToolCapabilities } from '../core/adapters/types.js';
import { loadBacklogFromCatalog } from '../core/backlog/load.js';
import { resolveRepo } from '../core/repo.js';
import { getCatalogMeta, listWorkItemsByScope, type WorkItemScope } from '../db/backlogCatalog.js';
import { DefaultsSchema, type Budget, type Defaults, type Retry, type Task, type Workflow } from '../core/backlog/schema.js';
import { logCaughtError } from '../core/events/index.js';

export interface WorkItemCatalogEntry {
  id: string;
  /** Persistent catalog identity; kept separate from display-only fallbacks. */
  persistedId?: string;
  title: string;
  /** Parent epic identity — surfaced muted on web kanban cards. */
  epicId?: string;
  epicTitle?: string;
  /** Resolved by the aggregate catalog query; missing ownership is always
   * represented explicitly instead of guessed from the web server cwd. */
  projectId: string | null;
  repoId: string | null;
  repoLabel: string | null;
  workItemType: 'feature';
  integrityIssue?: string;
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

/** Compatibility alias while older UI call sites migrate to Work Item naming. */
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

let cachedSettings: BacklogSettings = DEFAULT_BACKLOG_SETTINGS;

/** Settings retain their legacy per-repository/defaults behavior.  The
 * Work-Item projection below is deliberately separate and filesystem-free. */
function loadSettings(cwd: string): void {
  try {
    const snapshot = resolveConfigSnapshot(cwd);
    const { repoId } = resolveRepo(cwd);
    const backlog = loadBacklogFromCatalog(repoId, cwd);
    const resolvedDefaults = mergeExecutionDefaults(DefaultsSchema.parse({}), backlog.defaults);
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
    logCaughtError('ui/catalog.loadSettings', error);
    cachedSettings = DEFAULT_BACKLOG_SETTINGS;
  }
}

/** DB-only aggregate catalog.  No cwd, config, or spec-file reads occur per
 * Work Item, so a Project scope remains a single indexed SQLite query. */
export function getFeatureCatalog(scope: WorkItemScope = {}): Record<string, WorkItemCatalogEntry> {
  try {
    return Object.fromEntries(listWorkItemsByScope(scope).map((row) => {
      const feature = JSON.parse(row.dataJson) as {
        id: string; title: string; skills?: string[]; tool: string; model?: string; effort: string;
        thinking?: string; spec?: string; tasks?: Task[]; dependsOn: string[]; workflow: Workflow;
        retry?: Retry; specFile?: string; context?: string[]; maxTokens?: number; autoStart?: boolean;
      };
      return [row.featureId, {
        id: feature.id,
        persistedId: row.featureId,
        title: feature.title,
        epicId: row.epicId,
        epicTitle: row.epicTitle,
        projectId: row.projectId,
        repoId: row.repoId,
        repoLabel: row.repoLabel,
        workItemType: row.workItemType,
        integrityIssue: row.integrityIssue,
        skills: feature.skills ?? [],
        tool: feature.tool,
        model: feature.model,
        effort: feature.effort,
        thinking: feature.thinking,
        description: feature.spec ?? null,
        tasks: feature.tasks,
        dependsOn: feature.dependsOn,
        workflow: feature.workflow,
        retry: feature.retry,
        specFile: feature.specFile,
        context: feature.context,
        maxTokens: feature.maxTokens,
        autoStart: feature.autoStart,
      } satisfies WorkItemCatalogEntry];
    }));
  } catch (error) {
    logCaughtError('ui/catalog.getFeatureCatalog', error);
    return {};
  }
}

export function getBacklogSettings(cwd = process.cwd()): BacklogSettings {
  loadSettings(cwd);
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
