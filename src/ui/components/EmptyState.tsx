import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme/context.js';

export function EmptyState(): React.ReactElement {
  const theme = useTheme();
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text {...theme.role('muted')}>No runs yet — run `msq run` first</Text>
    </Box>
  );
}
