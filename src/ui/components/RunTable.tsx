import React from 'react';
import { Box, Text } from 'ink';
import type { RunSummary } from '../../db/repo.js';
import { STATUS_COLOR, STATUS_ICON, formatElapsed, formatTokens } from '../format.js';

export { formatTokens } from '../format.js';

interface Props {
  runs: RunSummary[];
  width: number;
}

export function RunTable({ runs, width }: Props): React.ReactElement {
  const compact = width < 60;

  return (
    <Box flexDirection="column">
      {compact ? (
        <Box>
          <Text bold dimColor>{'feature_id'.padEnd(20)} {'status'.padEnd(12)}</Text>
        </Box>
      ) : (
        <Box>
          <Text bold dimColor>{'feature_id'.padEnd(24)} {'tool'.padEnd(12)} {'status'.padEnd(12)} {'duration'.padEnd(10)} {'tokens'.padEnd(8)}</Text>
        </Box>
      )}
      {runs.map((run) => {
        const icon = STATUS_ICON[run.status];
        const color = STATUS_COLOR[run.status];
        const duration = formatElapsed(run.startedAt, run.endedAt);
        const tokens = run.status === 'done' ? formatTokens(run.totalTokens) : '—';
        const featureId = run.featureId.slice(0, compact ? 19 : 23);

        if (compact) {
          return (
            <Box key={run.runId}>
              <Text>{featureId.padEnd(20)}</Text>
              <Text color={color}>{icon} {run.status}</Text>
            </Box>
          );
        }

        return (
          <Box key={run.runId}>
            <Text>{featureId.padEnd(24)}</Text>
            <Text dimColor>{run.tool.padEnd(12)}</Text>
            <Text color={color}>{(icon + ' ' + run.status).padEnd(12)}</Text>
            <Text dimColor>{duration.padEnd(10)}</Text>
            <Text dimColor>{tokens}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
