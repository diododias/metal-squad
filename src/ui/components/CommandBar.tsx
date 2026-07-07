import React from 'react';
import { Box, Text } from 'ink';
import type { ActiveView } from './MainPanel.js';
import type { FocusPanel } from './Sidebar.js';
import { truncateText } from '../format.js';
import { useTheme } from '../theme/context.js';

interface Props {
  activeView: ActiveView;
  focusPanel: FocusPanel;
  hasRuns: boolean;
  hasGates: boolean;
  hasPending: boolean;
  canPause: boolean;
  canResume: boolean;
  canAbort: boolean;
  dashboardOpen?: boolean;
  width: number;
}

export function CommandBar({
  activeView,
  focusPanel,
  hasRuns,
  hasGates,
  hasPending,
  canPause,
  canResume,
  canAbort,
  dashboardOpen,
  width,
}: Props): React.ReactElement {
  const theme = useTheme();
  const actions = dashboardOpen
    ? ['[/] period', 'd close', 'esc close', 'q quit']
    : activeView === 'notifications'
      ? ['o close', 'esc overview', 'tab panel', 'q quit']
    : [
    'tab panel',
    hasRuns ? 'j/k move' : '',
    hasRuns ? 'enter open' : '',
    activeView === 'run' ? 'esc overview' : '',
    activeView === 'run' ? 'ctrl+s pause logs' : '',
    hasPending && activeView === 'overview' ? 'n start' : '',
    hasPending && activeView === 'overview' ? '↑/↓ select' : '',
    focusPanel !== 'gates' && canPause ? 'p pause' : '',
    focusPanel !== 'gates' && canResume ? 'r resume' : '',
    canAbort ? 'x abort' : '',
    hasGates && focusPanel === 'gates' ? 'a approve' : '',
    hasGates && focusPanel === 'gates' ? 's skip' : '',
    hasGates && focusPanel === 'gates' ? 'r retry' : '',
    'o notifications',
    'd dashboard',
    'q quit',
  ].filter(Boolean);

  return (
    <Box marginTop={1}>
      <Text {...theme.role('muted')}>{truncateText(actions.join('  |  '), Math.max(24, width - 2))}</Text>
    </Box>
  );
}
