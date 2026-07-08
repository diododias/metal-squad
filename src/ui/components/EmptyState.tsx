import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme/context.js';

// F31 "Riscos de UX resolvidos" item 5: shown when nothing on the board is
// navigable at all (no runs, no pending features) — the onboarding message
// points at the two ways out, and `n`/`?` remain reachable from here.
export function EmptyState(): React.ReactElement {
  const theme = useTheme();
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text {...theme.role('muted')}>Backlog vazio — rode `msq init` ou adicione features em backlog.yaml</Text>
    </Box>
  );
}
