import React from 'react';
import { Box, Text } from 'ink';
import type { GateRow } from '../../db/repo.js';

interface Props {
  gates: GateRow[];
  selectedIndex: number;
}

export function GatePanel({ gates, selectedIndex }: Props): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow" bold>⊘ Gates awaiting decision</Text>
      <Text dimColor>  [a]pprove  [s]kip  [r]etry  ↑↓ navigate</Text>
      {gates.map((gate, i) => {
        const isSelected = i === selectedIndex;
        return (
          <Box key={gate.id} marginTop={0}>
            <Text color={isSelected ? 'yellow' : undefined} bold={isSelected}>
              {isSelected ? '▶ ' : '  '}
              {gate.featureId} ({gate.repoId})
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
