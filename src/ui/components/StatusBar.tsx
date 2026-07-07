import React from 'react';
import { Box, Text } from 'ink';
import type { RunSummary } from '../../db/repo.js';
import type { FeatureCatalogEntry } from '../catalog.js';
import {
  STATUS_COLOR,
  STATUS_ICON,
  estimateCost,
  formatCost,
  formatElapsed,
  formatTokensIO,
  truncateText,
} from '../format.js';

interface Props {
  selectedRun: RunSummary | null;
  selectedFeature: FeatureCatalogEntry | null;
  gateCount: number;
  totalRuns: number;
  doneRuns: number;
  width: number;
  currentStage?: string;
}

export function StatusBar({
  selectedRun,
  selectedFeature,
  gateCount,
  totalRuns,
  doneRuns,
  width,
  currentStage,
}: Props): React.ReactElement {
  const progress = `${doneRuns}/${totalRuns} done`;

  const featureLabel = selectedRun
    ? currentStage
      ? `${STATUS_ICON[selectedRun.status]} ${selectedRun.featureId} > ${currentStage}`
      : `${STATUS_ICON[selectedRun.status]} ${selectedRun.featureId}`
    : null;

  const summary = selectedRun
    ? [
        featureLabel,
        selectedRun.tool,
        formatTokensIO(selectedRun.inputTokens, selectedRun.cachedInputTokens ?? null, selectedRun.outputTokens),
        formatElapsed(selectedRun.startedAt, selectedRun.endedAt),
        formatCost(estimateCost(
          selectedRun.inputTokens,
          selectedRun.cachedInputTokens ?? null,
          selectedRun.outputTokens,
          selectedFeature?.model ?? selectedRun.tool,
        )),
        progress,
        selectedRun.pipelineResumeSummary ?? null,
        gateCount > 0 ? `${gateCount} gates` : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : `Idle | ${progress}${gateCount > 0 ? ` | ${gateCount} gates open` : ''}`;

  return (
    <Box borderStyle="single" borderColor={selectedRun ? STATUS_COLOR[selectedRun.status] : 'gray'} paddingX={1} marginTop={1}>
      <Text>{truncateText(summary, Math.max(24, width - 4))}</Text>
    </Box>
  );
}
