import React from 'react';
import { Box, Text } from 'ink';
import type { GateRow } from '../../db/repo.js';
import { useTheme } from '../theme/context.js';

interface Props {
  gates: GateRow[];
  selectedIndex: number;
}

export function GatePanel({ gates, selectedIndex }: Props): React.ReactElement {
  const theme = useTheme();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text {...theme.role('warning')} bold>⊘ Gates awaiting decision</Text>
      <Text {...theme.role('muted')}>  [a]pprove  [s]kip  [r]etry  ↑↓ navigate</Text>
      {gates.map((gate, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={gate.id} marginTop={0}>
            <Text {...(isSelected ? theme.role('warning') : theme.role('text'))} bold={isSelected}>
              {isSelected ? '▶ ' : '  '}
              {gate.featureId} ({gate.repoId})
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
