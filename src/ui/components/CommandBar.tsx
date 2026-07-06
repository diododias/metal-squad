import React from 'react';
import { Box, Text } from 'ink';
import type { ActiveView } from './MainPanel.js';
import type { FocusPanel } from './Sidebar.js';
import { truncateText } from '../format.js';

interface Props {
  activeView: ActiveView;
  focusPanel: FocusPanel;
  hasRuns: boolean;
  hasGates: boolean;
  width: number;
}

export function CommandBar({
  activeView,
  focusPanel,
  hasRuns,
  hasGates,
  width,
}: Props): React.ReactElement {
  const actions = [
    'tab panel',
    hasRuns ? 'j/k move' : '',
    hasRuns ? 'enter open' : '',
    activeView === 'run' ? 'esc overview' : '',
    activeView === 'run' ? 'ctrl+s pause logs' : '',
    hasGates && focusPanel === 'gates' ? 'a approve' : '',
    hasGates && focusPanel === 'gates' ? 's skip' : '',
    hasGates && focusPanel === 'gates' ? 'r retry' : '',
    'q quit',
  ].filter(Boolean);

  return (
    <Box marginTop={1}>
      <Text dimColor>{truncateText(actions.join('  |  '), Math.max(24, width - 2))}</Text>
    </Box>
  );
}
