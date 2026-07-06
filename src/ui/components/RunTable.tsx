import React from 'react';
import { Box, Text } from 'ink';
import type { RunSummary } from '../../db/repo.js';

type Status = RunSummary['status'];

const STATUS_ICON: Record<Status, string> = {
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '⊘',
};

const STATUS_COLOR: Record<Status, string> = {
  running: 'cyan',
  done: 'green',
  failed: 'red',
  blocked: 'yellow',
};

function formatElapsed(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const secs = Math.floor((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m${secs % 60}s`;
}

export function formatTokens(total: number | null): string {
  if (total === null) return '—';
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

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
