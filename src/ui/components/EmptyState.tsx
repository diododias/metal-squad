import React from 'react';
import { Box, Text } from 'ink';

export function EmptyState(): React.ReactElement {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text dimColor>No runs yet — run `msq run` first</Text>
    </Box>
  );
}
