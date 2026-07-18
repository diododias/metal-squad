import type { WorkflowMode } from '../backlog/schema.js';

/** Publish-gate defaults for the standard staged workflow. */
export const DEFAULT_STAGE_PUBLISHES: Readonly<Record<string, boolean>> = {
  specify: false,
  plan: false,
  tasks: false,
  implement: true,
  validate: false,
};

/**
 * Resolves whether a workflow stage must satisfy the full publish contract.
 * Explicit workflow configuration wins; unknown stages in a single-stage
 * workflow publish by default so custom one-step workflows remain useful.
 */
export function stagePublishesResolved(
  stage: string,
  workflowMode: WorkflowMode,
  override: Record<string, boolean> = {},
): boolean {
  return override[stage] ?? DEFAULT_STAGE_PUBLISHES[stage] ?? workflowMode === 'single';
}
