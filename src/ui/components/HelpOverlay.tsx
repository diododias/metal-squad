import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { KeyboardShortcut } from '../types/shortcuts.js';
import { useTheme } from '../theme/context.js';
import { getSurfaceBorderStyle, getSurfaceTitleStyle, mergeInkStyles } from '../theme/styles.js';

interface Props {
  isOpen: boolean;
  currentContext: string;
  shortcuts: KeyboardShortcut[];
  width: number;
  onClose: () => void;
  onOpenPalette: () => void;
}

function renderShortcutLine(
  theme: ReturnType<typeof useTheme>,
  shortcut: KeyboardShortcut,
  activeContext: string,
): React.ReactElement {
  const available = !shortcut.condition || shortcut.condition();
  const active = shortcut.scope === 'context' && shortcut.context === activeContext;
  const prefix = active ? '* ' : '  ';

  return (
    <Text
      key={`${shortcut.scope}:${shortcut.context ?? 'global'}:${shortcut.key}:${shortcut.label}`}
      {...mergeInkStyles(
        active ? theme.role('focus') : theme.role('text'),
        !available ? theme.role('muted') : undefined,
      )}
    >
      {prefix}
      {shortcut.key.padEnd(8)}
      {shortcut.label}
    </Text>
  );
}

export function HelpOverlay({
  isOpen,
  currentContext,
  shortcuts,
  width,
  onClose,
  onOpenPalette,
}: Props): React.ReactElement | null {
  const theme = useTheme();
  useInput(
    (input, key) => {
      if (!isOpen) return;

      if (key.escape || input === '?') {
        onClose();
        return;
      }

      if ((key.ctrl && input.toLowerCase() === 'p') || input === ':') {
        onOpenPalette();
      }
    },
    { isActive: isOpen }
  );

  if (!isOpen) {
    return null;
  }

  const overlayWidth = Math.max(48, Math.min(width - 6, 92));
  const globalShortcuts = shortcuts.filter((shortcut) => shortcut.scope === 'global');
  const contextShortcuts = shortcuts.filter((shortcut) => shortcut.scope === 'context');
  const activeContextShortcuts = contextShortcuts.filter((shortcut) => shortcut.context === currentContext);

  return (
    <Box position="absolute" flexDirection="column" marginTop={2} marginLeft={4}>
      <Box borderStyle="round" {...getSurfaceBorderStyle(theme, { active: true, role: 'warning' })} paddingX={1} width={overlayWidth} flexDirection="column">
        <Text {...getSurfaceTitleStyle(theme, true)}>Keyboard Shortcuts</Text>
        <Text {...theme.role('muted')}>Current context: {currentContext}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text {...theme.role('text')} bold>Global</Text>
          {globalShortcuts.map((shortcut) => renderShortcutLine(theme, shortcut, currentContext))}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text {...theme.role('primary')} bold>Context</Text>
          {activeContextShortcuts.length > 0 ? (
            activeContextShortcuts.map((shortcut) => renderShortcutLine(theme, shortcut, currentContext))
          ) : (
            <Text {...theme.role('muted')}>  No context-specific shortcuts active here.</Text>
          )}
        </Box>
        {contextShortcuts.length > activeContextShortcuts.length ? (
          <Box marginTop={1} flexDirection="column">
            <Text {...theme.role('text')} bold>Other contexts</Text>
            {contextShortcuts
              .filter((shortcut) => shortcut.context !== currentContext)
              .map((shortcut) => renderShortcutLine(theme, shortcut, currentContext))}
          </Box>
        ) : null}
        <Text {...theme.role('muted')}>?: close help  Esc: close help  Ctrl+P or : open palette</Text>
      </Box>
    </Box>
  );
}
