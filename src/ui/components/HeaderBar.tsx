import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme/context.js';

interface Props {
  version: string;
  repoLabel: string;
  width: number;
}

/**
 * F31 section 1 + "Fora de escopo": replaces the 4-5 line ASCII wordmark
 * banner with a single line. The multi-line banner cost vertical space that
 * directly fought H10 (screens overflowing terminal height); one line keeps
 * product identity without spending the budget getVerticalBudget is meant
 * to protect.
 */
export function HeaderBar({ version, repoLabel, width }: Props): React.ReactElement {
  const theme = useTheme();
  return (
    <Box width={width} justifyContent="space-between">
      <Box>
        <Text {...theme.role('primary')} bold>METAL SQUAD</Text>
        <Text {...theme.role('muted')}> v{version}</Text>
      </Box>
      <Text {...theme.role('muted')}>{repoLabel}</Text>
    </Box>
  );
}
