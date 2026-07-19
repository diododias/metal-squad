export type DomainErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'EPIC_NOT_FOUND'
  | 'REPO_ALREADY_LINKED'
  | 'REPO_NOT_FOUND'
  | 'REPO_NOT_LINKED_TO_PROJECT'
  | 'REPO_IN_USE'
  | 'REVISION_CONFLICT';

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
