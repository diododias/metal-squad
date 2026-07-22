export type DomainErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'EPIC_NOT_FOUND'
  | 'WORK_ITEM_NOT_FOUND'
  | 'WORK_ITEM_HAS_HISTORY'
  | 'REPOSITORY_NOT_IN_PROJECT'
  | 'REPOSITORY_UNAVAILABLE'
  | 'DEPENDENCY_NOT_FOUND'
  | 'CROSS_REPOSITORY_DEPENDENCY'
  | 'DEPENDENCY_CYCLE'
  | 'REPO_ALREADY_LINKED'
  | 'REPO_NOT_FOUND'
  | 'REPO_NOT_LINKED_TO_PROJECT'
  | 'REPO_IN_USE'
  | 'REVISION_CONFLICT'
  | 'WORKFLOW_TEMPLATE_NOT_FOUND'
  | 'WORKFLOW_TEMPLATE_IMMUTABLE'
  | 'WORKFLOW_TEMPLATE_INVALID'
  | 'WORKFLOW_TEMPLATE_IN_USE'
  | 'WORKFLOW_TEMPLATE_ARCHIVED'
  | 'WORKFLOW_TEMPLATE_SCOPE_MISMATCH'
  | 'ENTITY_RUNNING'
  | 'ENTITY_HAS_HISTORY'
  | 'ENTITY_IN_USE'
  | 'ANCESTOR_ARCHIVED';

export class DomainError extends Error {
  public constructor(
    public readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ProjectNotFoundError extends DomainError {
  public constructor(projectId: string) {
    super('PROJECT_NOT_FOUND', `Project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
  }
}

export class EpicNotFoundError extends DomainError {
  public constructor(epicId: string) {
    super('EPIC_NOT_FOUND', `Epic not found: ${epicId}`);
    this.name = 'EpicNotFoundError';
  }
}

export class WorkItemNotFoundError extends DomainError {
  public constructor(workItemId: string) {
    super('WORK_ITEM_NOT_FOUND', `Work Item not found: ${workItemId}`);
    this.name = 'WorkItemNotFoundError';
  }
}

/** Raised when a type change is attempted on a Work Item that already ran.
 * The existing runs are tied to the old workflow, so the snapshot is frozen. */
export class WorkItemHasHistoryError extends DomainError {
  public readonly runCount: number;

  public constructor(workItemId: string, runCount: number) {
    super(
      'WORK_ITEM_HAS_HISTORY',
      `Work Item ${workItemId} has ${String(runCount)} run(s) and can no longer change type`,
    );
    this.name = 'WorkItemHasHistoryError';
    this.runCount = runCount;
  }
}

export class RepositoryNotInProjectError extends DomainError {
  public constructor(repoId: string, projectId: string) {
    super('REPOSITORY_NOT_IN_PROJECT', `Repository ${repoId} is not linked to project ${projectId}`);
    this.name = 'RepositoryNotInProjectError';
  }
}

export class RepositoryUnavailableError extends DomainError {
  public constructor(repoId: string, detail = 'is unavailable') {
    super('REPOSITORY_UNAVAILABLE', `Repository ${repoId} ${detail}`);
    this.name = 'RepositoryUnavailableError';
  }
}

export class DependencyNotFoundError extends DomainError {
  public constructor(workItemId: string) {
    super('DEPENDENCY_NOT_FOUND', `Dependency Work Item not found: ${workItemId}`);
    this.name = 'DependencyNotFoundError';
  }
}

export class CrossRepositoryDependencyError extends DomainError {
  public constructor(workItemId: string, repoId: string) {
    super('CROSS_REPOSITORY_DEPENDENCY', `Dependency Work Item ${workItemId} belongs to another repository (${repoId})`);
    this.name = 'CrossRepositoryDependencyError';
  }
}

export class DependencyCycleError extends DomainError {
  public constructor(message: string) {
    super('DEPENDENCY_CYCLE', message);
    this.name = 'DependencyCycleError';
  }
}

export class RepoAlreadyLinkedError extends DomainError {
  public constructor(repoId: string, projectId: string) {
    super('REPO_ALREADY_LINKED', `Repository ${repoId} is already linked to project ${projectId}`);
    this.name = 'RepoAlreadyLinkedError';
  }
}

export class RepoNotFoundError extends DomainError {
  public constructor(repoId: string) {
    super('REPO_NOT_FOUND', `Repository not found: ${repoId}`);
    this.name = 'RepoNotFoundError';
  }
}

export class RepoNotLinkedToProjectError extends DomainError {
  public constructor(repoId: string, projectId: string) {
    super('REPO_NOT_LINKED_TO_PROJECT', `Repository ${repoId} is not linked to project ${projectId}`);
    this.name = 'RepoNotLinkedToProjectError';
  }
}

export class RepoInUseError extends DomainError {
  public constructor(repoId: string) {
    super('REPO_IN_USE', `Repository ${repoId} has linked work items and cannot be moved or unlinked`);
    this.name = 'RepoInUseError';
  }
}

export class RevisionConflictError extends DomainError {
  public constructor(
    public readonly projectId: string,
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
    entityName = 'Project',
  ) {
    super(
      'REVISION_CONFLICT',
      `${entityName} ${projectId} has revision ${String(actualRevision)}; expected ${String(expectedRevision)}`,
    );
    this.name = 'RevisionConflictError';
  }
}

/** The lifecycle entity kind the policy engine reasons about. */
export type LifecycleEntityKind = 'project' | 'epic' | 'work_item';

const LIFECYCLE_ENTITY_LABEL: Record<LifecycleEntityKind, string> = {
  project: 'Project',
  epic: 'Epic',
  work_item: 'Work Item',
};

function lifecycleLabel(kind: LifecycleEntityKind): string {
  return LIFECYCLE_ENTITY_LABEL[kind];
}

/** Raised when archive/delete is attempted on an entity that is still running
 * (an active run/pipeline or a pending stage request). The caller must cancel
 * the execution first. */
export class EntityRunningError extends DomainError {
  public constructor(
    public readonly entityKind: LifecycleEntityKind,
    public readonly entityId: string,
  ) {
    super('ENTITY_RUNNING', `${lifecycleLabel(entityKind)} ${entityId} is running; cancel it before archiving or deleting`);
    this.name = 'EntityRunningError';
  }
}

/** Raised when a logical delete is attempted on an entity that already has run
 * history. History-bearing entities may be archived but never deleted, so their
 * audit trail is preserved. */
export class EntityHasHistoryError extends DomainError {
  public constructor(
    public readonly entityKind: LifecycleEntityKind,
    public readonly entityId: string,
  ) {
    super('ENTITY_HAS_HISTORY', `${lifecycleLabel(entityKind)} ${entityId} has run history and can be archived but not deleted`);
    this.name = 'EntityHasHistoryError';
  }
}

/** Raised when a logical delete is blocked by a live reference: a downstream
 * `dependsOn`, an external task, a topic association, or a not-yet-tombstoned
 * descendant/linked repository. */
export class EntityInUseError extends DomainError {
  public constructor(
    public readonly entityKind: LifecycleEntityKind,
    public readonly entityId: string,
    detail: string,
  ) {
    super('ENTITY_IN_USE', `${lifecycleLabel(entityKind)} ${entityId} cannot be deleted: ${detail}`);
    this.name = 'EntityInUseError';
  }
}

/** Raised when a restore is attempted while an ancestor is still archived; the
 * ancestor must be restored first because effective listings hide descendants
 * of an archived ancestor. */
export class AncestorArchivedError extends DomainError {
  public constructor(
    public readonly entityKind: LifecycleEntityKind,
    public readonly entityId: string,
  ) {
    super('ANCESTOR_ARCHIVED', `${lifecycleLabel(entityKind)} ${entityId} has an archived ancestor; restore the ancestor first`);
    this.name = 'AncestorArchivedError';
  }
}

export class WorkflowTemplateNotFoundError extends DomainError {
  public constructor(templateId: string) {
    super('WORKFLOW_TEMPLATE_NOT_FOUND', `Workflow template not found: ${templateId}`);
    this.name = 'WorkflowTemplateNotFoundError';
  }
}

export class WorkflowTemplateImmutableError extends DomainError {
  public constructor(templateId: string) {
    super(
      'WORKFLOW_TEMPLATE_IMMUTABLE',
      `Workflow template ${templateId} is builtin and immutable; duplicate it to customise`,
    );
    this.name = 'WorkflowTemplateImmutableError';
  }
}

export class WorkflowTemplateInvalidError extends DomainError {
  public constructor(
    public readonly issues: string[],
    templateName?: string,
  ) {
    super(
      'WORKFLOW_TEMPLATE_INVALID',
      `Workflow template${templateName ? ` ${templateName}` : ''} is invalid: ${issues.join('; ')}`,
    );
    this.name = 'WorkflowTemplateInvalidError';
  }
}

export class WorkflowTemplateInUseError extends DomainError {
  public constructor(
    templateId: string,
    public readonly mappings: { projectId: string; workItemType: string }[],
  ) {
    super(
      'WORKFLOW_TEMPLATE_IN_USE',
      `Workflow template ${templateId} is mapped by ${String(mappings.length)} Work Item type(s) and must be reassociated before archiving`,
    );
    this.name = 'WorkflowTemplateInUseError';
  }
}

export class WorkflowTemplateArchivedError extends DomainError {
  public constructor(templateId: string) {
    super('WORKFLOW_TEMPLATE_ARCHIVED', `Workflow template ${templateId} is archived and cannot be mapped`);
    this.name = 'WorkflowTemplateArchivedError';
  }
}

export class WorkflowTemplateScopeMismatchError extends DomainError {
  public constructor(templateId: string, projectId: string) {
    super(
      'WORKFLOW_TEMPLATE_SCOPE_MISMATCH',
      `Workflow template ${templateId} does not belong to project ${projectId}`,
    );
    this.name = 'WorkflowTemplateScopeMismatchError';
  }
}
