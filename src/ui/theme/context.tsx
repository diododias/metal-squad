import React, { createContext, useContext, useMemo } from 'react';
import { resolveThemePreference } from './resolve.js';
import type { ThemeContextValue, ThemeResolution } from './types.js';

function createThemeContextValue(resolution: ThemeResolution): ThemeContextValue {
  return {
    resolution,
    role: (name) => resolution.profile.roles[name],
    surface: resolution.profile.surface,
    statusTone: (status) => resolution.profile.roles[resolution.profile.statusRoleByRun[status]],
    notificationTone: (tone) => resolution.profile.roles[resolution.profile.notificationRoleByEvent[tone]],
  };
}

const DEFAULT_RESOLUTION = resolveThemePreference(undefined);
const ThemeContext = createContext<ThemeContextValue>(createThemeContextValue(DEFAULT_RESOLUTION));

interface ThemeProviderProps {
  children: React.ReactNode;
  resolution?: ThemeResolution;
}

export function ThemeProvider({
  children,
  resolution = DEFAULT_RESOLUTION,
}: ThemeProviderProps): React.ReactElement {
  const value = useMemo(() => createThemeContextValue(resolution), [resolution]);
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
