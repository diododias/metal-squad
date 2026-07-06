import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useRuns } from './hooks/useRuns.js';
import { useGates } from './hooks/useGates.js';
import { useTerminalWidth } from './hooks/useTerminalWidth.js';
import { RunTable } from './components/RunTable.js';
import { GatePanel } from './components/GatePanel.js';
import { EmptyState } from './components/EmptyState.js';

export function App(): React.ReactElement {
  const runs = useRuns(2000);
  const { gates, resolve } = useGates(2000);
  const width = useTerminalWidth();
  const [selectedGate, setSelectedGate] = useState(0);

  useInput((_input, key) => {
    if (_input === 'q') {
      process.exit(0);
    }

    if (gates.length > 0) {
      if (key.upArrow) {
        setSelectedGate((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedGate((i) => Math.min(gates.length - 1, i + 1));
      } else if (_input === 'a') {
        const gate = gates[selectedGate];
        if (gate) resolve(gate.id, 'approved');
      } else if (_input === 's') {
        const gate = gates[selectedGate];
        if (gate) resolve(gate.id, 'skipped');
      } else if (_input === 'r') {
        const gate = gates[selectedGate];
        if (gate) resolve(gate.id, 'retried');
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>
        metal-squad
      </Text>
      {runs.length === 0 ? (
        <EmptyState />
      ) : (
        <RunTable runs={runs} width={width} />
      )}
      {gates.length > 0 && (
        <GatePanel gates={gates} selectedIndex={selectedGate} />
      )}
      <Box marginTop={1}>
        <Text dimColor>q: quit</Text>
      </Box>
    </Box>
  );
}
