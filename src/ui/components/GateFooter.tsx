import React from 'react';
import { Box, Text } from 'ink';
import type { PendingApproval } from '../hooks/useGates.js';
import { truncateText } from '../format.js';
import { useTheme } from '../theme/context.js';
import { getSurfaceBorderStyle, getSurfaceTitleStyle } from '../theme/styles.js';

interface Props {
  gates: PendingApproval[];
  selectedIndex: number;
  isFocused: boolean;
  width: number;
}

export function GateFooter({
  gates,
  selectedIndex,
  isFocused,
  width,
}: Props): React.ReactElement | null {
  const theme = useTheme();
  if (gates.length === 0) return null;

  const visible = gates.slice(0, 3);
  const contentWidth = Math.max(24, width - 4);
  const selected = gates[selectedIndex] ?? visible[0] ?? null;

  return (
    <Box
      borderStyle="round"
      {...getSurfaceBorderStyle(theme, { active: isFocused, role: 'warning' })}
      paddingX={1}
      flexDirection="column"
      marginTop={1}
      width={width}
    >
      <Text {...getSurfaceTitleStyle(theme, isFocused)}>Approvals Pending</Text>
      {visible.map((gate, index) => (
        <Text
          key={`${gate.kind}:${String(gate.id)}:${gate.featureId}`}
          {...(index === selectedIndex ? theme.role('warning') : theme.role('text'))}
          bold={index === selectedIndex}
        >
          {index === selectedIndex ? '>' : ' '} {truncateText(`${gate.featureId}${gate.kind === 'stage' ? ' [stage]' : ''}`, contentWidth - 2)}
        </Text>
      ))}
      {selected?.prompt ? (
        <Text {...theme.role('muted')}>
          {truncateText(selected.prompt, contentWidth)}
        </Text>
      ) : null}
      <Text {...theme.role('muted')}>a approve  s hold/skip  r retry</Text>
    </Box>
  );
}
