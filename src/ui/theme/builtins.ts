import type {
  NotificationTone,
  RunStatusTone,
  ThemeInkStyle,
  ThemeName,
  ThemeProfile,
  ThemeRoleName,
} from './types.js';

const DEFAULT_STATUS_ROLES: Record<RunStatusTone, ThemeRoleName> = {
  running: 'primary',
  done: 'success',
  failed: 'error',
  blocked: 'warning',
  aborted: 'accent',
};

const DEFAULT_NOTIFICATION_ROLES: Record<NotificationTone, ThemeRoleName> = {
  info: 'primary',
  success: 'success',
  warning: 'warning',
  error: 'error',
  accent: 'accent',
};

function defineTheme(
  name: ThemeName,
  label: string,
  description: string,
  roles: Record<ThemeRoleName, ThemeInkStyle>,
  borderColor: string,
  backgroundMode: ThemeProfile['surface']['backgroundMode'],
  backgroundColor?: string,
): ThemeProfile {
  return {
    name,
    label,
    description,
    roles,
    surface: {
      borderColor,
      backgroundMode,
      backgroundColor,
    },
    statusRoleByRun: DEFAULT_STATUS_ROLES,
    notificationRoleByEvent: DEFAULT_NOTIFICATION_ROLES,
  };
}

export const BUILTIN_THEMES: Record<ThemeName, ThemeProfile> = {
  default: defineTheme(
    'default',
    'Default',
    'Keeps the current bright terminal look close to the existing palette.',
    {
      text: { color: 'white' },
      primary: { color: 'cyan', bold: true },
      success: { color: 'green', bold: true },
      warning: { color: 'yellow', bold: true },
      error: { color: 'red', bold: true },
      muted: { color: '#9a9a9a' },
      accent: { color: 'magenta', bold: true },
      focus: { color: 'cyan', bold: true, inverse: true },
    },
    'cyan',
    'terminal',
  ),
  dark: defineTheme(
    'dark',
    'Dark',
    'Biases toward cooler borders and brighter text for dark terminal backgrounds.',
    {
      text: { color: 'white' },
      primary: { color: 'blue', bold: true },
      success: { color: 'green', bold: true },
      warning: { color: 'yellow', bold: true },
      error: { color: 'red', bold: true },
      muted: { color: '#9a9a9a' },
      accent: { color: 'cyan', bold: true },
      focus: { color: 'blue', bold: true, inverse: true },
    },
    'blue',
    'filled',
    'black',
  ),
  light: defineTheme(
    'light',
    'Light',
    'Uses darker primaries and calmer borders so text stays readable on light terminals.',
    {
      text: { color: 'black' },
      primary: { color: 'blue', bold: true },
      success: { color: 'green' },
      warning: { color: 'yellow', bold: true },
      error: { color: 'red', bold: true },
      muted: { color: '#5a5a5a' },
      accent: { color: 'magenta' },
      focus: { color: 'blue', bold: true, inverse: true },
    },
    'black',
    'terminal',
  ),
  minimal: defineTheme(
    'minimal',
    'Minimal',
    'Reduces color variety and leans on emphasis so constrained terminals stay understandable.',
    {
      text: { color: 'white' },
      primary: { bold: true },
      success: { bold: true },
      warning: { color: 'yellow', bold: true },
      error: { color: 'red', bold: true, inverse: true },
      muted: { color: '#9a9a9a' },
      accent: { inverse: true },
      focus: { bold: true, inverse: true },
    },
    'gray',
    'inverse',
  ),
};

export function getBuiltinTheme(name: ThemeName): ThemeProfile {
  return BUILTIN_THEMES[name];
}
