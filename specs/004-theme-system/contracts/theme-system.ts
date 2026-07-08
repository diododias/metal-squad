/**
 * Contract: Theme System
 *
 * These types define the public contract for the built-in TUI theme system.
 * They are intended to guide implementation and tests for config-driven theme
 * selection, fallback behavior, and semantic styling across Ink components.
 */

export type ThemeName = 'default' | 'dark' | 'light' | 'minimal';

export type ThemeRoleName =
  | 'text'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'muted'
  | 'accent'
  | 'focus';

export type RunStatusTone = 'running' | 'done' | 'failed' | 'blocked' | 'aborted';

export type NotificationTone = 'info' | 'success' | 'warning' | 'error' | 'accent';

/**
 * Ink-compatible text/emphasis style token.
 */
export interface ThemeInkStyle {
  color?: string;
  backgroundColor?: string;
  bold?: boolean;
  dimColor?: boolean;
  inverse?: boolean;
}

/**
 * Shared surface behavior for panels and framed sections.
 */
export interface ThemeSurfaceStyle {
  borderColor: string;
  backgroundMode: 'terminal' | 'filled' | 'inverse';
  backgroundColor?: string;
}

/**
 * Built-in theme definition consumed by the TUI.
 */
export interface ThemeProfile {
  name: ThemeName;
  label: string;
  description: string;
  roles: Record<ThemeRoleName, ThemeInkStyle>;
  surface: ThemeSurfaceStyle;
  statusRoleByRun: Record<RunStatusTone, ThemeRoleName>;
  notificationRoleByEvent: Record<NotificationTone, ThemeRoleName>;
}

/**
 * Raw user preference read from config.
 */
export interface ThemePreferenceInput {
  theme?: string;
}

/**
 * Resolution result after validating the configured theme name.
 */
export interface ThemeResolution {
  requested: string | null;
  active: ThemeName;
  profile: ThemeProfile;
  fallbackReason: 'missing' | 'unknown' | null;
  message: string | null;
}

/**
 * Theme context value exposed to Ink components.
 */
export interface ThemeContextValue {
  resolution: ThemeResolution;
  role: (name: ThemeRoleName) => ThemeInkStyle;
  surface: ThemeSurfaceStyle;
  statusTone: (status: RunStatusTone) => ThemeInkStyle;
  notificationTone: (tone: NotificationTone) => ThemeInkStyle;
}
