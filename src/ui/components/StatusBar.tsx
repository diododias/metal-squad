import React from 'react';
import { Box, Text } from 'ink';
import type { RunSummary } from '../../db/repo.js';
import type { FeatureCatalogEntry } from '../catalog.js';
import { STATUS_COLOR, STATUS_ICON, formatElapsed, formatTokens, truncateText } from '../format.js';

interface Props {
  selectedRun: RunSummary | null;
  selectedFeature: FeatureCatalogEntry | null;
  gateCount: number;
  width: number;
}

export function StatusBar({
  selectedRun,
  selectedFeature,
  gateCount,
  width,
}: Props): React.ReactElement {
  const summary = selectedRun
    ? `${STATUS_ICON[selectedRun.status]} ${selectedRun.featureId} | ${selectedRun.tool} | ${selectedRun.status} | ${formatElapsed(selectedRun.startedAt, selectedRun.endedAt)} | ${formatTokens(selectedRun.totalTokens)} tok | ${gateCount} gates | ${selectedFeature?.title ?? 'Untitled feature'}`
    : `Idle board | ${gateCount} gates open | select a run to inspect details`;

  return (
    <Box borderStyle="single" borderColor={selectedRun ? STATUS_COLOR[selectedRun.status] : 'gray'} paddingX={1} marginTop={1}>
      <Text>{truncateText(summary, Math.max(24, width - 4))}</Text>
    </Box>
  );
}
