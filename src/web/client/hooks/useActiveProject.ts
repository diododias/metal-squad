import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectSummary } from '../../types.js';

export const ACTIVE_PROJECT_STORAGE_KEY = 'msq.activeProjectId.v1';

export interface ActiveProjectContextValue {
  activeProjectId: string | null;
  activeProject: ProjectSummary | null;
  setActiveProject: (projectId: string | null) => void;
  selectionInvalidated: boolean;
}

const unavailable = (): never => {
  throw new Error('useActiveProject must be used within ActiveProjectProvider.');
};

export const ActiveProjectContext = React.createContext<ActiveProjectContextValue>({
  activeProjectId: null,
  activeProject: null,
  setActiveProject: unavailable,
  selectionInvalidated: false,
});

function orderedProjects(projects: ProjectSummary[]): ProjectSummary[] {
  return [...projects].sort((a, b) => a.position - b.position || a.projectId.localeCompare(b.projectId));
}

export function resolveActiveProjectId(projects: ProjectSummary[], savedProjectId: string | null): string | null {
  if (savedProjectId && projects.some((project) => project.projectId === savedProjectId)) return savedProjectId;
  return orderedProjects(projects)[0]?.projectId ?? null;
}

function logStorageError(action: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[useActiveProject.${action}] localStorage unavailable: ${message}`);
}

function readStoredProjectId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
  } catch (error) {
    logStorageError('read', error);
    return null;
  }
}

function persistProjectId(projectId: string | null): void {
  try {
    if (projectId === null) window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    else window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId);
  } catch (error) {
    logStorageError('write', error);
  }
}

export function ActiveProjectProvider({ projects, children }: { projects: ProjectSummary[]; children: React.ReactNode }): React.JSX.Element {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => resolveActiveProjectId(projects, readStoredProjectId()));
  const [selectionInvalidated, setSelectionInvalidated] = useState(false);

  useEffect(() => {
    const nextProjectId = resolveActiveProjectId(projects, activeProjectId);
    if (nextProjectId !== activeProjectId) {
      setSelectionInvalidated(activeProjectId !== null);
      setActiveProjectId(nextProjectId);
      persistProjectId(nextProjectId);
    }
  }, [activeProjectId, projects]);

  const setActiveProject = useCallback((projectId: string | null) => {
    const nextProjectId = resolveActiveProjectId(projects, projectId);
    setSelectionInvalidated(false);
    setActiveProjectId(nextProjectId);
    persistProjectId(nextProjectId);
  }, [projects]);

  const activeProject = projects.find((project) => project.projectId === activeProjectId) ?? null;
  const value = useMemo(() => ({ activeProjectId, activeProject, setActiveProject, selectionInvalidated }), [activeProjectId, activeProject, setActiveProject, selectionInvalidated]);

  return React.createElement(ActiveProjectContext.Provider, { value }, children);
}

export function useActiveProject(): ActiveProjectContextValue {
  return React.useContext(ActiveProjectContext);
}
