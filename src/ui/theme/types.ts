export const THEME_NAMES = ['default', 'dark', 'light', 'minimal'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const THEME_ROLE_NAMES = [
  'text',
  'primary',
  'success',
  'warning',
  'error',
  'muted',
  'accent',
  'focus',
] as const;
export type ThemeRoleName = (typeof THEME_ROLE_NAMES)[number];

export type RunStatusTone = 'running' | 'done' | 'failed' | 'blocked' | 'aborted';
export type NotificationTone = 'info' | 'success' | 'warning' | 'error' | 'accent';

export interface ThemeInkStyle {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dimColor?: boolean;
  inverse?: boolean;
}

export interface ThemeSurfaceStyle {
  borderColor: string;
  backgroundMode: 'terminal' | 'filled' | 'inverse';
  backgroundColor?: string;
}

export interface ThemeProfile {
  name: ThemeName;
  label: string;
  description: string;
  roles: Record<ThemeRoleName, ThemeInkStyle>;
  surface: ThemeSurfaceStyle;
  statusRoleByRun: Record<RunStatusTone, ThemeRoleName>;
  notificationRoleByEvent: Record<NotificationTone, ThemeRoleName>;
}

export interface ThemePreferenceInput {
  theme?: string;
}

export interface ThemeResolution {
  requested: string | null;
  active: ThemeName;
  profile: ThemeProfile;
  fallbackReason: 'missing' | 'unknown' | null;
  message: string | null;
}

export interface ThemeContextValue {
  resolution: ThemeResolution;
  role: (name: ThemeRoleName) => ThemeInkStyle;
  surface: ThemeSurfaceStyle;
  statusTone: (status: RunStatusTone) => ThemeInkStyle;
  notificationTone: (tone: NotificationTone) => ThemeInkStyle;
}
