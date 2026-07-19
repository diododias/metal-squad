import {
  createWorkItem,
  type CreateWorkItemInput,
  type WorkItemRow,
} from '../db/repo.js';
import type { ServiceMutationResult } from './projectService.js';

function normalizeInput(input: CreateWorkItemInput): CreateWorkItemInput {
  const description = input.description?.trim();
  return {
    ...input,
    title: input.title.trim(),
    ...(description === undefined ? {} : { description: description.length === 0 ? null : description }),
    ...(input.dependsOn === undefined ? {} : { dependsOn: [...new Set(input.dependsOn)] }),
  };
}

export const workItemService = {
  create(input: CreateWorkItemInput): ServiceMutationResult<WorkItemRow> {
    const entity = createWorkItem(normalizeInput(input));
    return { entity, revision: entity.revision };
  },
};
