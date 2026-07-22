import { execSync } from 'node:child_process';
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { stringify } from 'yaml';
import { getProject, listEpics, listArchivedEpics, listProjectRepos, type EpicRow } from '../../db/repo.js';
import { listWorkItemsByScope, type WorkItemCatalogEntry } from '../../db/backlogCatalog.js';
import {
  WorkItemSchema,
  type BacklogV3,
  type BacklogRepositoryV3,
  type EpicV3,
  type WorkItemV3,
} from './schema.js';

export class BacklogExportNotFoundError extends Error {
  public constructor(projectId: string) {
    super(`Project not found or archived: ${projectId}`);
    this.name = 'BacklogExportNotFoundError';
  }
}

export interface ExportBacklogOptions {
  includeArchived?: boolean;
  /** Emits the local filesystem `path` for each repository. Off by default so
   * the asset stays portable across machines (SPEC "Segurança do asset"). */
  includePaths?: boolean;
}

/** Same secret-shaped heuristics `sanitizeRuntimeConfig` (src/web/state.ts)
 * guards against for runtime config, applied defensively to exported string
 * values even though the Work Item schema has no dedicated credential field. */
const SECRET_LIKE_PATTERN = /(token|secret|password|webhook|api[_-]?key)[a-z_-]*\s*[:=]\s*\S+/i;

function assertNoSecretLikeContent(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (SECRET_LIKE_PATTERN.test(value)) {
      throw new Error(`Export refused: value at "${path}" looks like it contains a secret.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => { assertNoSecretLikeContent(entry, `${path}[${String(index)}]`); });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      assertNoSecretLikeContent(entry, `${path}.${key}`);
    }
  }
}

function resolveRemote(path: string): string | undefined {
  try {
    const remote = execSync('git config --get remote.origin.url', {
      cwd: path,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    return remote.length > 0 ? remote : undefined;
  } catch {
    return undefined;
  }
}

function exportRepositories(projectId: string, includePaths: boolean): BacklogRepositoryV3[] {
  return listProjectRepos(projectId).map((repo) => ({
    repoId: repo.repoId,
    label: basename(repo.path) || repo.repoId,
    ...(existsSync(repo.path) ? { remote: resolveRemote(repo.path) } : {}),
    ...(includePaths ? { path: repo.path } : {}),
  }));
}

function exportEpics(epicRows: EpicRow[]): EpicV3[] {
  return epicRows.map((epic) => ({
    id: epic.epicId,
    title: epic.title,
    ...(epic.description ? { description: epic.description } : {}),
    status: epic.status,
    position: epic.position,
    ...(epic.archivedAt ? { archivedAt: epic.archivedAt } : {}),
  }));
}

function exportWorkItems(entries: WorkItemCatalogEntry[]): WorkItemV3[] {
  return entries.map((entry) => {
    const stored = JSON.parse(entry.dataJson) as Record<string, unknown>;
    const workItem = WorkItemSchema.parse(stored);
    return {
      ...workItem,
      epicId: entry.epicId,
      repoId: entry.repoId ?? '',
      position: entry.position,
      ...(entry.archivedAt ? { archivedAt: entry.archivedAt } : {}),
    };
  });
}

/**
 * Serializes a Project's full catalog (repos, project-level Epics, Work
 * Items) from the DB into the portable v3 asset shape. The DB catalog is the
 * source of truth (PRJ-15); this never reads `backlog.yaml`. Tombstones and
 * audit events are never included — only active state, plus archived state
 * when `includeArchived` is set.
 */
export function exportBacklogV3(projectId: string, options: ExportBacklogOptions = {}): BacklogV3 {
  const project = getProject(projectId, { includeArchived: options.includeArchived });
  if (!project) throw new BacklogExportNotFoundError(projectId);

  const epicRows = options.includeArchived
    ? [...listEpics(projectId), ...listArchivedEpics({ projectId })]
    : listEpics(projectId);

  const workItemEntries = options.includeArchived
    ? [
        ...listWorkItemsByScope({ projectId, lifecycle: 'active' }),
        ...listWorkItemsByScope({ projectId, lifecycle: 'archived' }),
      ]
    : listWorkItemsByScope({ projectId, lifecycle: 'active' });

  const asset: BacklogV3 = {
    version: 3,
    project: {
      id: project.projectId,
      name: project.name,
      ...(project.description ? { description: project.description } : {}),
      position: project.position,
    },
    repositories: exportRepositories(projectId, options.includePaths ?? false),
    epics: exportEpics(epicRows),
    workItems: exportWorkItems(workItemEntries),
  };

  assertNoSecretLikeContent(asset, 'backlog');
  if (!options.includePaths) {
    for (const repo of asset.repositories) {
      if ('path' in repo) throw new Error(`Export refused: repository "${repo.repoId}" leaked an absolute path.`);
    }
  }

  return asset;
}

export type ExportFormat = 'yaml' | 'json';

export function serializeBacklogV3(asset: BacklogV3, format: ExportFormat): string {
  return format === 'json' ? `${JSON.stringify(asset, null, 2)}\n` : stringify(asset);
}

/** Writes the serialized asset atomically: staged into a temp file in the same
 * directory, then renamed over the destination. */
export function writeBacklogExportFile(path: string, contents: string, cwd = process.cwd()): void {
  const absPath = resolve(cwd, path);
  const temporaryPath = `${absPath}.msq-${String(process.pid)}-${String(Date.now())}.tmp`;
  writeFileSync(temporaryPath, contents, 'utf8');
  renameSync(temporaryPath, absPath);
}
