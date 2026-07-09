import React from 'react';
import { Box, Text } from 'ink';
import type { StatsRunRow } from '../../db/repo.js';
import {
  aggregateTokens,
  formatTokensCompact,
  renderUsageBar,
} from '../../core/stats.js';
import { formatPercent, truncateText } from '../format.js';
import { useTheme } from '../theme/context.js';
import { getSurfaceBorderStyle, getSurfaceTitleStyle } from '../theme/styles.js';

interface Props {
  rows: StatsRunRow[];
  periodLabel: string;
  width: number;
}

const MAX_FEATURES = 8;

export function CostDashboard({ rows, periodLabel, width }: Props): React.ReactElement {
  const theme = useTheme();
  const innerWidth = Math.max(40, width - 4);
  const aggregates = aggregateTokens(rows);
  const maxFeatureTokens = aggregates.byFeature[0]?.tokens ?? 0;
  const averageContextPercent = summarizeContext(rows);

  return (
    <Box
      borderStyle="round"
      {...getSurfaceBorderStyle(theme)}
      paddingX={1}
      flexDirection="column"
      width={width}
    >
      <Text {...getSurfaceTitleStyle(theme)}>Usage Telemetry — {periodLabel}</Text>
      <Text {...theme.role('muted')}>Press [ and ] to change period, d or Esc to close.</Text>

      {rows.length === 0 ? (
        <Box marginTop={1}>
          <Text {...theme.role('muted')}>No runs recorded for this period.</Text>
        </Box>
      ) : (
        <>
          <Box marginTop={1} flexDirection="column">
            <Text {...theme.role('text')} bold>{padColumns(['Repo', 'Tool', 'Runs', 'Tokens', 'Ctx%'], innerWidth)}</Text>
            {aggregates.byRepoTool.map((line) => (
              <Text key={`${line.repoId}-${line.tool}`} {...theme.role('text')}>
                {padColumns([
                  truncateText(line.repoId, 18),
                  line.tool,
                  String(line.runs),
                  formatTokensCompact(line.tokens),
                  formatPercent(line.maxContextPercent),
                ], innerWidth)}
              </Text>
            ))}
            <Text {...theme.role('text')} bold>
              {padColumns([
                'Total',
                '',
                String(rows.length),
                formatTokensCompact(aggregates.totalTokens),
                formatPercent(averageContextPercent),
              ], innerWidth)}
            </Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text {...theme.role('text')} bold>By feature</Text>
            {aggregates.byFeature.slice(0, MAX_FEATURES).map((line) => (
              <Text key={line.featureId} {...theme.role('text')}>
                <Text {...theme.role('primary')}>{renderUsageBar(line.tokens, maxFeatureTokens)}</Text>
                {' '}
                {truncateText(line.featureId, 22).padEnd(Math.min(22, innerWidth))}
                {'  '}
                {formatTokensCompact(line.tokens).padStart(8)}
                {'  '}
                {formatPercent(line.maxContextPercent).padStart(7)}
              </Text>
            ))}
            {aggregates.byFeature.length > MAX_FEATURES && (
              <Text {...theme.role('muted')}>  +{aggregates.byFeature.length - MAX_FEATURES} more features</Text>
            )}
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Text {...theme.role('text')} bold>By status</Text>
            {aggregates.byStatus.map((line) => (
              <Text key={line.status} {...theme.role('text')}>
                {`${line.status}`.padEnd(9)} {String(line.runs).padStart(3)} runs
                {'  '}{formatTokensCompact(line.tokens).padStart(8)}
                {'  '}{formatPercent(line.maxContextPercent).padStart(7)}
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

function summarizeContext(rows: StatsRunRow[]): number | null {
  const valid = rows
    .map((row) => row.contextWindowPercent)
    .filter((value): value is number => value !== null && value !== undefined);
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}
