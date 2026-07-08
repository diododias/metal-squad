import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme/context.js';

interface Props {
  label: string;
  count: number;
  focused: boolean;
  width: number;
  stacked: boolean;
  emptyLabel: string;
  overflowCount?: number;
  children?: React.ReactNode;
}

/**
 * F31 section 3 / "Estados vazios": one column box per dashboard group,
 * rendered side-by-side (full/compact layout) or stacked (< 80 col). Unlike
 * the old behavior of skipping empty groups entirely, every column always
 * renders — with a short EmptyState placeholder instead of blank space —
 * so `←/→` has something to reason about and the board reads consistently
 * even when a group has nothing in it.
 */
export function KanbanColumn({
  label,
  count,
  focused,
  width,
  stacked,
  emptyLabel,
  overflowCount = 0,
  children,
}: Props): React.ReactElement {
  const theme = useTheme();
  const hasChildren = React.Children.count(children) > 0;

  return (
    <Box
      flexDirection="column"
      width={width}
      marginRight={stacked ? 0 : 1}
      marginBottom={stacked ? 1 : 0}
    >
      <Text {...(focused ? theme.role('focus') : theme.role('text'))} bold>
        {focused ? '> ' : '  '}{label} ({count})
      </Text>
      {hasChildren ? (
        <Box flexDirection="column" marginTop={1}>
          {children}
          {overflowCount > 0 && (
            <Text {...theme.role('muted')}>+{overflowCount} more</Text>
          )}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text {...theme.role('muted')}>{emptyLabel}</Text>
        </Box>
      )}
    </Box>
  );
}
