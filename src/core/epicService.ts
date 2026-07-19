import {
  createEpic,
  getEpic,
  listEpics,
  updateEpic,
  type CreateEpicInput,
  type EpicRow,
  type UpdateEpicPatch,
} from '../db/repo.js';
import type { ServiceMutationResult } from './projectService.js';

function normalizedEpicPatch(patch: UpdateEpicPatch): UpdateEpicPatch {
  const normalized: UpdateEpicPatch = {};
  if (patch.title !== undefined) normalized.title = patch.title.trim();
  if (patch.description !== undefined) normalized.description = patch.description;
  if (patch.status !== undefined) normalized.status = patch.status;
  if (patch.position !== undefined) normalized.position = patch.position;
  if (Object.keys(normalized).length === 0) throw new Error('Epic update requires at least one allowed patch field.');
  return normalized;
}

export const epicService = {
  create(input: CreateEpicInput): ServiceMutationResult<EpicRow> {
    const entity = createEpic({ ...input, title: input.title.trim() });
    return { entity, revision: entity.revision };
  },

  update(epicId: string, patch: UpdateEpicPatch, expectedRevision: number): ServiceMutationResult<EpicRow> {
    const entity = updateEpic(epicId, normalizedEpicPatch(patch), expectedRevision);
    return { entity, revision: entity.revision };
  },

  list(projectId?: string): EpicRow[] {
    return listEpics(projectId);
  },

  get(epicId: string): EpicRow | null {
    return getEpic(epicId);
  },
};
