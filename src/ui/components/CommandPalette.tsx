import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { CommandCategory } from '../types/commands.js';
import type { CommandPaletteState } from '../hooks/useCommandPalette.js';

interface Props {
  state: CommandPaletteState;
  width: number;
  onClose: () => void;
  onExecute: () => void;
  onSelectPrevious: () => void;
  onSelectNext: () => void;
  onQueryChange: (query: string) => void;
}

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  run: 'Run Control',
  gate: 'Gates',
  view: 'Views',
  system: 'System',
};

const CATEGORY_ORDER: CommandCategory[] = ['run', 'gate', 'view', 'system'];

function isPrintableInput(input: string, key: Record<string, boolean>): boolean {
  return input.length === 1 && !key.ctrl && !key.meta && !key.escape;
}

export function CommandPalette({
  state,
  width,
  onClose,
  onExecute,
  onSelectPrevious,
  onSelectNext,
  onQueryChange,
}: Props): React.ReactElement | null {
  useInput(
    (input, key) => {
      if (!state.isOpen) return;

      if (key.escape) {
        onClose();
        return;
      }

      if (key.return) {
        onExecute();
        return;
      }

      if (key.upArrow || input === 'k') {
        onSelectPrevious();
        return;
      }

      if (key.downArrow || input === 'j') {
        onSelectNext();
        return;
      }

      if (key.backspace || key.delete) {
        onQueryChange(state.query.slice(0, -1));
        return;
      }

      if (isPrintableInput(input, key as Record<string, boolean>)) {
        onQueryChange(`${state.query}${input}`);
      }
    },
    { isActive: state.isOpen }
  );

  if (!state.isOpen) {
    return null;
  }

  const paletteWidth = Math.max(44, Math.min(width - 6, 88));
  const categoryBuckets = new Map<CommandCategory, typeof state.filteredCommands>();

  for (const category of CATEGORY_ORDER) {
    categoryBuckets.set(category, []);
  }

  for (const command of state.filteredCommands) {
    categoryBuckets.get(command.category)?.push(command);
  }

  return (
    <Box position="absolute" flexDirection="column" marginTop={2} marginLeft={2}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} width={paletteWidth} flexDirection="column">
        <Text color="cyan" bold>Command Palette</Text>
        <Text dimColor>{state.query ? `> ${state.query}` : '> Type to search commands'}</Text>
        <Box marginTop={1} flexDirection="column">
          {state.filteredCommands.length === 0 ? (
            <Text dimColor>No commands found for this query.</Text>
          ) : (
            CATEGORY_ORDER.map((category) => {
              const commands = categoryBuckets.get(category) ?? [];
              if (commands.length === 0) return null;

              return (
                <Box key={category} flexDirection="column" marginBottom={1}>
                  <Text color="yellow">{CATEGORY_LABELS[category]}</Text>
                  {commands.map((command) => {
                    const selected = state.filteredCommands[state.selectedIndex]?.id === command.id;
                    return (
                      <Box key={command.id}>
                        <Text color={selected ? 'cyan' : undefined} bold={selected}>
                          {selected ? '>' : ' '} {command.name}
                        </Text>
                        {command.shortcut ? <Text dimColor>{`  [${command.shortcut}]`}</Text> : null}
                      </Box>
                    );
                  })}
                </Box>
              );
            })
          )}
        </Box>
        <Text dimColor>Ctrl+P or : open  Enter execute  Esc close  j/k navigate</Text>
      </Box>
    </Box>
  );
}
