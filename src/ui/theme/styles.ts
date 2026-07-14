import type { RunOutputRow } from '../../db/repo.js';
import type { ThemeContextValue, ThemeInkStyle, ThemeRoleName, NotificationTone } from './types.js';

const EVENT_TONE: Record<string, NotificationTone> = {
  'run:start': 'info',
  'gate:created': 'warning',
  'gate:resolved': 'warning',
  'stage:request-created': 'accent',
  'stage:request-resolved': 'accent',
  'run:failed': 'error',
  'budget:alert': 'accent',
  'run:done': 'success',
  'ui:info': 'info',
  'ui:notice': 'error',
};

export function mergeInkStyles(
  ...styles: (ThemeInkStyle | null | undefined)[]
): ThemeInkStyle {
  const merged: ThemeInkStyle = {};
  for (const style of styles) {
    if (!style) continue;
    if (style.color !== undefined) merged.color = style.color;
    if (style.backgroundColor !== undefined) merged.backgroundColor = style.backgroundColor;
    if (style.bold !== undefined) merged.bold = style.bold;
    if (style.dimColor !== undefined) merged.dimColor = style.dimColor;
    if (style.inverse !== undefined) merged.inverse = style.inverse;
  }
  return merged;
}

export function getSurfaceBorderStyle(
  theme: ThemeContextValue,
  options: { active?: boolean; role?: ThemeRoleName } = {},
): { borderColor: string } {
  const activeStyle = options.active ? theme.role('focus') : undefined;
  const roleStyle = options.role ? theme.role(options.role) : undefined;
  return {
    borderColor: activeStyle?.color ?? roleStyle?.color ?? theme.surface.borderColor,
  };
}

export function getSurfaceTitleStyle(
  theme: ThemeContextValue,
  active = false,
): ThemeInkStyle {
  const surfaceAccent = theme.surface.backgroundMode === 'inverse'
    ? { inverse: true }
    : theme.surface.backgroundMode === 'filled'
      ? { backgroundColor: theme.surface.backgroundColor }
      : undefined;
  return mergeInkStyles(active ? theme.role('focus') : theme.role('primary'), surfaceAccent);
}

export function getNotificationTone(event: string): NotificationTone {
  return EVENT_TONE[event] ?? 'info';
}

export function getOutputStyle(
  theme: ThemeContextValue,
  source: RunOutputRow['source'],
): ThemeInkStyle {
  switch (source) {
    case 'tool':
      return mergeInkStyles(theme.role('primary'), { dimColor: true });
    case 'stderr':
      return theme.role('error');
    case 'heartbeat':
      return theme.role('muted');
    case 'stdout':
    case 'agent':
      return theme.role('text');
    default:
      return theme.role('text');
  }
}

export function getWorkflowRole(args: {
  running: number;
  failed: number;
  blocked: number;
  done: number;
  total: number;
}): ThemeRoleName {
  if (args.running > 0) return 'primary';
  if (args.failed > 0) return 'error';
  if (args.blocked > 0) return 'warning';
  if (args.done === args.total && args.total > 0) return 'success';
  return 'text';
}
