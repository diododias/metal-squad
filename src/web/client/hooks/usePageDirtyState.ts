import { useCallback, useState } from 'react';

export interface PageDirtyRegistration {
  isDirty: boolean;
  isValid: boolean;
  save: () => void;
}

const EMPTY_REGISTRATION: PageDirtyRegistration = {
  isDirty: false,
  isValid: true,
  save: () => undefined,
};

/**
 * Lets independently composed page sections contribute one page-level save
 * affordance without coupling their draft state to the page layout.
 */
export function usePageDirtyState(): PageDirtyRegistration & {
  register: (registration: PageDirtyRegistration) => void;
  clear: () => void;
} {
  const [registration, setRegistration] = useState<PageDirtyRegistration>(EMPTY_REGISTRATION);

  const register = useCallback((next: PageDirtyRegistration): void => {
    setRegistration((current) => current.isDirty === next.isDirty
      && current.isValid === next.isValid
      && current.save === next.save
      ? current
      : next);
  }, []);

  const clear = useCallback((): void => {
    setRegistration(EMPTY_REGISTRATION);
  }, []);

  return { ...registration, register, clear };
}
