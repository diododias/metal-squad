import { BUILTIN_THEMES, getBuiltinTheme } from './builtins.js';
import type { ThemeName, ThemePreferenceInput, ThemeResolution } from './types.js';

const DEFAULT_THEME_NAME: ThemeName = 'default';

export function getDefaultThemeName(): ThemeName {
  return DEFAULT_THEME_NAME;
}

export function getBuiltinThemeNames(): ThemeName[] {
  return Object.keys(BUILTIN_THEMES) as ThemeName[];
}

export function isThemeName(value: string): value is ThemeName {
  return Object.prototype.hasOwnProperty.call(BUILTIN_THEMES, value);
}

export function resolveThemePreference(preference: ThemePreferenceInput['theme']): ThemeResolution {
  const requested = preference?.trim() ?? null;
  if (!requested) {
    return {
      requested: null,
      active: DEFAULT_THEME_NAME,
      profile: getBuiltinTheme(DEFAULT_THEME_NAME),
      fallbackReason: 'missing',
      message: null,
    };
  }

  if (isThemeName(requested)) {
    return {
      requested,
      active: requested,
      profile: getBuiltinTheme(requested),
      fallbackReason: null,
      message: null,
    };
  }

  return {
    requested,
    active: DEFAULT_THEME_NAME,
    profile: getBuiltinTheme(DEFAULT_THEME_NAME),
    fallbackReason: 'unknown',
    message: `Theme "${requested}" is not supported. Using "${DEFAULT_THEME_NAME}".`,
  };
}
