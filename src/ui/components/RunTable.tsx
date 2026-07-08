import React from 'react';
import { Box, Text } from 'ink';
import type { RunSummary } from '../../db/repo.js';
import {
  STATUS_ICON,
  formatElapsed,
  formatTokens,
  getRunStatusTone,
  getRunStageLabel,
  getRunStatusLabel,
} from '../format.js';
import { useTheme } from '../theme/context.js';

export { formatTokens } from '../format.js';

interface Props {
  runs: RunSummary[];
  width: number;
  selectedIndex?: number;
  isFocused?: boolean;
}

export function RunTable({
  runs,
  width,
  selectedIndex = 0,
  isFocused = false,
}: Props): React.ReactElement {
  const theme = useTheme();
  const compact = width < 60;

  return (
    <Box flexDirection="column">
      {compact ? (
        <Box>
          <Text {...theme.role('muted')} bold>{'feature_id'.padEnd(20)} {'status'.padEnd(12)}</Text>
        </Box>
      ) : (
        <Box>
          <Text {...theme.role('muted')} bold>{'feature_id'.padEnd(24)} {'tool'.padEnd(12)} {'stage'.padEnd(20)} {'status'.padEnd(18)} {'duration'.padEnd(10)} {'tokens'.padEnd(8)}</Text>
        </Box>
      )}
      {runs.map((run, index) => {
        const icon = STATUS_ICON[run.status];
        const statusStyle = theme.statusTone(getRunStatusTone(run.status));
        const duration = formatElapsed(run.startedAt, run.endedAt);
        // Mostra consumo em tempo real: qualquer run com tokens acumulados,
        // nao apenas as concluidas. Runs recem-iniciadas (0 tokens) ficam com '—'.
        const tokens = run.totalTokens && run.totalTokens > 0 ? formatTokens(run.totalTokens) : '—';
        const featureId = run.featureId.slice(0, compact ? 19 : 23);
        const stage = getRunStageLabel(run) ?? '—';
        const statusLabel = getRunStatusLabel(run);
        const selected = index === selectedIndex;

        if (compact) {
          return (
            <Box key={run.runId}>
              <Text {...(selected && isFocused ? theme.role('focus') : theme.role('text'))} bold={selected}>
                {selected ? '>' : ' '} {featureId.padEnd(18)}
              </Text>
              <Text {...statusStyle}>{icon} {statusLabel}</Text>
            </Box>
          );
        }

        return (
          <Box key={run.runId}>
            <Text {...(selected && isFocused ? theme.role('focus') : theme.role('text'))} bold={selected}>
              {(selected ? '> ' : '  ') + featureId.padEnd(22)}
            </Text>
            <Text {...theme.role('muted')}>{run.tool.padEnd(12)}</Text>
            <Text {...theme.role('muted')}>{stage.padEnd(20)}</Text>
            <Text {...statusStyle}>{(icon + ' ' + statusLabel).padEnd(18)}</Text>
            <Text {...theme.role('muted')}>{duration.padEnd(10)}</Text>
            <Text {...theme.role('muted')}>{tokens}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
