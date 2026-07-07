import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { KeyboardShortcut } from '../types/shortcuts.js';

interface Props {
  isOpen: boolean;
  currentContext: string;
  shortcuts: KeyboardShortcut[];
  width: number;
  onClose: () => void;
  onOpenPalette: () => void;
}

function renderShortcutLine(shortcut: KeyboardShortcut, activeContext: string): React.ReactElement {
  const available = !shortcut.condition || shortcut.condition();
  const active = shortcut.scope === 'context' && shortcut.context === activeContext;
  const prefix = active ? '* ' : '  ';

  return (
    <Text key={`${shortcut.scope}:${shortcut.context ?? 'global'}:${shortcut.key}`} color={active ? 'cyan' : undefined} dimColor={!available}>
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
      <Box borderStyle="round" borderColor="yellow" paddingX={1} width={overlayWidth} flexDirection="column">
        <Text color="yellow" bold>Keyboard Shortcuts</Text>
        <Text dimColor>Current context: {currentContext}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>Global</Text>
          {globalShortcuts.map((shortcut) => renderShortcutLine(shortcut, currentContext))}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">Context</Text>
          {activeContextShortcuts.length > 0 ? (
            activeContextShortcuts.map((shortcut) => renderShortcutLine(shortcut, currentContext))
          ) : (
            <Text dimColor>  No context-specific shortcuts active here.</Text>
          )}
        </Box>
        {contextShortcuts.length > activeContextShortcuts.length ? (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Other contexts</Text>
            {contextShortcuts
              .filter((shortcut) => shortcut.context !== currentContext)
              .map((shortcut) => renderShortcutLine(shortcut, currentContext))}
          </Box>
        ) : null}
        <Text dimColor>?: close help  Esc: close help  Ctrl+P or : open palette</Text>
      </Box>
    </Box>
  );
}
