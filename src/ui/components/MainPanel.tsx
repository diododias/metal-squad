import React from 'react';
import { Box, Text } from 'ink';
import type { GateRow, RunSummary } from '../../db/repo.js';
import type { FeatureCatalogEntry } from '../catalog.js';
import type { LayoutMode } from '../format.js';
import {
  STATUS_COLOR,
  STATUS_ICON,
  formatClock,
  formatElapsed,
  formatTokens,
  truncateText,
} from '../format.js';
import { EmptyState } from './EmptyState.js';
import { RunTable } from './RunTable.js';

export type ActiveView = 'overview' | 'run';

interface Props {
  runs: RunSummary[];
  gates: GateRow[];
  selectedRun: RunSummary | null;
  selectedFeature: FeatureCatalogEntry | null;
  activeView: ActiveView;
  mode: LayoutMode;
  width: number;
}

function overviewSummary(runs: RunSummary[], gates: GateRow[]): React.ReactElement {
  const running = runs.filter((run) => run.status === 'running').length;
  const done = runs.filter((run) => run.status === 'done').length;
  const failed = runs.filter((run) => run.status === 'failed').length;
  const blocked = runs.filter((run) => run.status === 'blocked').length;

  return (
    <Box marginBottom={1}>
      <Text color="cyan">{running} running</Text>
      <Text dimColor> | </Text>
      <Text color="green">{done} done</Text>
      <Text dimColor> | </Text>
      <Text color="red">{failed} failed</Text>
      <Text dimColor> | </Text>
      <Text color="yellow">{blocked} blocked</Text>
      <Text dimColor> | </Text>
      <Text>{gates.length} open gates</Text>
    </Box>
  );
}

export function MainPanel({
  runs,
  gates,
  selectedRun,
  selectedFeature,
  activeView,
  mode,
  width,
}: Props): React.ReactElement {
  const innerWidth = Math.max(32, width - 4);

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      width={width}
      marginRight={mode === 'stacked' ? 0 : 1}
      marginBottom={mode === 'stacked' ? 1 : 0}
    >
      <Text color="cyan" bold>
        {activeView === 'run' && selectedRun ? 'Run Detail' : 'Overview'}
      </Text>
      {runs.length === 0 ? (
        <EmptyState />
      ) : activeView === 'run' && selectedRun ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{selectedFeature?.title ?? selectedRun.featureId}</Text>
          <Text dimColor>{selectedRun.featureId} · {selectedRun.repoId}</Text>
          <Box marginTop={1}>
            <Text color={STATUS_COLOR[selectedRun.status]}>{STATUS_ICON[selectedRun.status]} {selectedRun.status}</Text>
            <Text dimColor> | tool {selectedRun.tool}</Text>
            <Text dimColor> | duration {formatElapsed(selectedRun.startedAt, selectedRun.endedAt)}</Text>
          </Box>
          <Box>
            <Text dimColor>started {formatClock(selectedRun.startedAt)}</Text>
            <Text dimColor> | ended {formatClock(selectedRun.endedAt)}</Text>
            <Text dimColor> | tokens {formatTokens(selectedRun.totalTokens)}</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Declared skills</Text>
            {selectedFeature?.skills?.length ? (
              selectedFeature.skills.map((skill) => (
                <Text key={skill} color="green">
                  - {skill}
                </Text>
              ))
            ) : (
              <Text dimColor>No backlog skill metadata found for this run.</Text>
            )}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Operator note</Text>
            <Text dimColor>
              Live output lands in F06. This panel already tracks the selected run and its execution metadata in real time.
            </Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {overviewSummary(runs, gates)}
          <Text dimColor>
            Select a run with arrows or j/k, then press Enter to inspect it. Esc returns here.
          </Text>
          <Box marginTop={1}>
            <RunTable runs={runs} width={innerWidth} />
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Command deck</Text>
            <Text dimColor>
              {truncateText(
                'The multi-panel shell is ready for F06 log streaming, F07 status refinements, and richer keyboard navigation in F08/F09.',
                Math.max(24, innerWidth - 2),
              )}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
