import React from 'react';
import { Box, Text } from 'ink';
import type { StatsRunRow } from '../../db/repo.js';
import {
  aggregateCosts,
  formatTokensCompact,
  renderUsageBar,
} from '../../core/stats.js';
import { truncateText } from '../format.js';

interface Props {
  rows: StatsRunRow[];
  periodLabel: string;
  width: number;
}

const MAX_FEATURES = 8;

export function CostDashboard({ rows, periodLabel, width }: Props): React.ReactElement {
  const innerWidth = Math.max(40, width - 4);
  const aggregates = aggregateCosts(rows);
  const maxFeatureTokens = aggregates.byFeature[0]?.tokens ?? 0;

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      flexDirection="column"
      width={width}
    >
      <Text color="cyan" bold>Token Usage — {periodLabel}</Text>
      <Text dimColor>Press [ and ] to change period, d or Esc to close.</Text>

      {rows.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>No runs recorded for this period.</Text>
        </Box>
      ) : (
        <>
          <Box marginTop={1} flexDirection="column">
            <Text bold>{padColumns(['Repo', 'Tool', 'Runs', 'Tokens', 'Cost'], innerWidth)}</Text>
            {aggregates.byRepoTool.map((line) => (
              <Text key={`${line.repoId}-${line.tool}`}>
                {padColumns([
                  truncateText(line.repoId, 18),
                  line.tool,
                  String(line.runs),
                  formatTokensCompact(line.tokens),
                  `$${line.costUsd.toFixed(2)}`,
                ], innerWidth)}
              </Text>
            ))}
            <Text bold>
              {padColumns([
                'Total',
                '',
                String(rows.length),
                formatTokensCompact(aggregates.totalTokens),
                `$${aggregates.totalCostUsd.toFixed(2)}`,
              ], innerWidth)}
            </Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text bold>By feature</Text>
            {aggregates.byFeature.slice(0, MAX_FEATURES).map((line) => (
              <Text key={line.featureId}>
                <Text color="cyan">{renderUsageBar(line.tokens, maxFeatureTokens)}</Text>
                {' '}
                {truncateText(line.featureId, 22).padEnd(Math.min(22, innerWidth))}
                {'  '}
                {formatTokensCompact(line.tokens).padStart(8)}
                {'  '}
                {`$${line.costUsd.toFixed(2)}`.padStart(7)}
              </Text>
            ))}
            {aggregates.byFeature.length > MAX_FEATURES && (
              <Text dimColor>  +{aggregates.byFeature.length - MAX_FEATURES} more features</Text>
            )}
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text bold>By status</Text>
            {aggregates.byStatus.map((line) => (
              <Text key={line.status} dimColor>
                {`${line.status}`.padEnd(9)} {String(line.runs).padStart(3)} runs
                {'  '}{formatTokensCompact(line.tokens).padStart(8)}
                {'  '}{`$${line.costUsd.toFixed(2)}`.padStart(7)}
              </Text>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

function padColumns(columns: string[], width: number): string {
  const widths = [20, 10, 6, 10, 9];
  const line = columns
    .map((column, index) => column.padEnd(widths[index] ?? 8))
    .join(' ');
  return truncateText(line, width);
}
