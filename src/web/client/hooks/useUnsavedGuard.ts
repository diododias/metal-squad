import { useCallback, useEffect, useRef, useState } from 'react';

export interface UnsavedGuard {
  navigate: (path: string) => void;
  onHashChange: () => boolean;
  discard: () => void;
  cancel: () => void;
  isConfirmingLeave: boolean;
}

function hashPath(): string {
  return window.location.hash.replace(/^#/, '') || '/board';
}

/** Keeps hash navigation and browser unload from silently losing a page draft. */
export function useUnsavedGuard(isDirty: boolean, onConfirmLeave: () => void): UnsavedGuard {
  const currentPathRef = useRef(hashPath());
  const allowHashChangeRef = useRef(false);
  const isDirtyRef = useRef(isDirty);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { if (!isDirty) setPendingPath(null); }, [isDirty]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      // Required by Chromium-based browsers to display the native prompt.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return (): void => { window.removeEventListener('beforeunload', onBeforeUnload); };
  }, []);

  const commit = useCallback((path: string): void => {
    currentPathRef.current = path;
    allowHashChangeRef.current = true;
    window.location.hash = path;
  }, []);

  const navigate = useCallback((path: string): void => {
    if (path === currentPathRef.current) return;
    if (isDirtyRef.current) { setPendingPath(path); return; }
    commit(path);
  }, [commit]);

  const onHashChange = useCallback((): boolean => {
    const nextPath = hashPath();
    if (allowHashChangeRef.current) {
      allowHashChangeRef.current = false;
      currentPathRef.current = nextPath;
      return true;
    }
    if (nextPath === currentPathRef.current) return true;
    if (!isDirtyRef.current) { currentPathRef.current = nextPath; return true; }
    setPendingPath(nextPath);
    window.location.hash = currentPathRef.current;
    return false;
  }, []);

  const discard = useCallback((): void => {
    const path = pendingPath;
    setPendingPath(null);
    onConfirmLeave();
    if (path) commit(path);
  }, [commit, onConfirmLeave, pendingPath]);

  const cancel = useCallback((): void => { setPendingPath(null); }, []);
  return { navigate, onHashChange, discard, cancel, isConfirmingLeave: pendingPath !== null };
}
