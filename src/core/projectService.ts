import { resolveRepoAllowlist, sanitizeRepoPath } from './repo.js';
import {
  createProject,
  getRegisteredRepo,
  getProject,
  linkRepo,
  listProjectRepos,
  listProjects,
  moveRepo,
  registerRepo,
  unlinkRepo,
  updateProject,
  type CreateProjectInput,
  type ProjectQueryOptions,
  type ProjectRepoRow,
  type ProjectRow,
  type UpdateProjectPatch,
} from '../db/repo.js';
import { RepoNotFoundError } from '../db/errors.js';

export interface ServiceMutationResult<TEntity> {
  entity: TEntity;
  revision: number | null;
}

function normalizedProjectPatch(patch: UpdateProjectPatch): UpdateProjectPatch {
  const normalized: UpdateProjectPatch = {};
  if (patch.name !== undefined) normalized.name = patch.name.trim();
  if (patch.description !== undefined) normalized.description = patch.description;
  if (patch.position !== undefined) normalized.position = patch.position;
  if (Object.keys(normalized).length === 0) throw new Error('Project update requires at least one allowed patch field.');
  return normalized;
}

export const projectService = {
  create(input: CreateProjectInput): ServiceMutationResult<ProjectRow> {
    const entity = createProject({ ...input, name: input.name.trim() });
    return { entity, revision: entity.revision };
  },

  update(projectId: string, patch: UpdateProjectPatch, expectedRevision: number): ServiceMutationResult<ProjectRow> {
    const entity = updateProject(projectId, normalizedProjectPatch(patch), expectedRevision);
    return { entity, revision: entity.revision };
  },

  list(options: ProjectQueryOptions = {}): ProjectRow[] {
    return listProjects(options);
  },

  get(projectId: string): ProjectRow | null {
    return getProject(projectId);
  },
};

export const repoLinkService = {
  list(projectId: string): ProjectRepoRow[] {
    return listProjectRepos(projectId);
  },

  link(
    projectId: string,
    input: { repoId?: string; path?: string; confirm?: boolean },
    options: { allowedRoots?: string[]; audit?: { actor?: string; requestId?: string } } = {},
  ): ServiceMutationResult<ProjectRepoRow> {
    if ((input.repoId === undefined) === (input.path === undefined)) {
      throw new Error('Provide exactly one of repoId or path when linking a repository.');
    }
    if (input.path !== undefined) {
      if (input.confirm !== true) {
        const error = new Error('Explicit confirmation is required before registering a repository path.');
        Object.assign(error, { code: 'REPO_PATH_CONFIRMATION_REQUIRED' });
        throw error;
      }
      const repo = sanitizeRepoPath(input.path, options.allowedRoots ?? resolveRepoAllowlist());
      registerRepo(repo.repoId, repo.path);
      const entity = linkRepo(projectId, repo.repoId, { audit: options.audit });
      return { entity, revision: null };
    }
    if (input.repoId === undefined) throw new Error('Repository id is required.');
    if (!getRegisteredRepo(input.repoId)) throw new RepoNotFoundError(input.repoId);
    const entity = linkRepo(projectId, input.repoId, { audit: options.audit });
    return { entity, revision: null };
  },

  move(repoId: string, toProjectId: string, options: { audit?: { actor?: string; requestId?: string } } = {}): ServiceMutationResult<ProjectRepoRow | null> {
    return { entity: moveRepo(repoId, toProjectId, { audit: options.audit }), revision: null };
  },

  unlink(repoId: string, options: { projectId?: string; audit?: { actor?: string; requestId?: string } } = {}): ServiceMutationResult<{ repoId: string; unlinked: boolean }> {
    return { entity: { repoId, unlinked: unlinkRepo(repoId, options) }, revision: null };
  },
};
