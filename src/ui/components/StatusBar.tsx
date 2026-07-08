import React from 'react';
import { Box, Text } from 'ink';
import type { RunSummary } from '../../db/repo.js';
import type { FeatureCatalogEntry } from '../catalog.js';
import type { ActiveView } from './MainPanel.js';
import {
  STATUS_ICON,
  formatElapsed,
  formatPercent,
  formatTokens,
  formatTokensIO,
  getRunStatusTone,
  getRunStatusLabel,
  truncateText,
} from '../format.js';
import { useTheme } from '../theme/context.js';
import { getSurfaceBorderStyle } from '../theme/styles.js';

interface Props {
  selectedRun: RunSummary | null;
  selectedFeature: FeatureCatalogEntry | null;
  gateCount: number;
  totalRuns: number;
  doneRuns: number;
  width: number;
  currentStage?: string;
  activeView?: ActiveView;
  shortcutHints?: string[];
  themeNotice?: string | null;
}

export function StatusBar({
  selectedRun,
  selectedFeature,
  gateCount,
  totalRuns,
  doneRuns,
  width,
  currentStage,
  activeView = 'overview',
  shortcutHints = [],
  themeNotice = null,
}: Props): React.ReactElement {
  const theme = useTheme();
  const progress = `${doneRuns}/${totalRuns} done`;

  const featureLabel = selectedRun
    ? currentStage
      ? `${STATUS_ICON[selectedRun.status]} ${selectedRun.featureId} > ${currentStage}`
      : `${STATUS_ICON[selectedRun.status]} ${selectedRun.featureId}`
    : null;

  const modelLabel = selectedFeature?.model ?? selectedRun?.tool ?? null;
  const effortLabel = selectedFeature ? `effort:${selectedFeature.effort}` : null;
  const pipelineTokens = selectedRun?.pipelineTotalTokens ?? selectedRun?.totalTokens ?? null;
  const contextLabel = selectedRun?.contextWindowTokens
    ? `ctx:${formatPercent(selectedRun.contextWindowPercent)}`
    : null;

  const summary = selectedRun
    ? [
        featureLabel,
        modelLabel,
        effortLabel,
        selectedRun ? getRunStatusLabel(selectedRun) : null,
        formatTokensIO(selectedRun.inputTokens, selectedRun.cachedInputTokens ?? null, selectedRun.outputTokens),
        pipelineTokens !== null ? `pipeline:${formatTokens(pipelineTokens)}` : null,
        contextLabel,
        formatElapsed(selectedRun.startedAt, selectedRun.endedAt),
        progress,
        selectedRun.pipelineResumeSummary ?? null,
        gateCount > 0 ? `${gateCount} gates` : null,
        activeView === 'notifications' ? 'notifications view' : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : `Idle | ${progress}${gateCount > 0 ? ` | ${gateCount} gates open` : ''}${activeView === 'notifications' ? ' | notifications view' : ''}`;

  return (
    <Box
      borderStyle="single"
      {...getSurfaceBorderStyle(theme, { role: selectedRun ? undefined : 'muted' })}
      borderColor={
        selectedRun
          ? theme.statusTone(getRunStatusTone(selectedRun.status)).color ?? theme.surface.borderColor
          : theme.surface.borderColor
      }
      paddingX={1}
      marginTop={1}
      flexDirection="column"
    >
      <Text {...theme.role('text')}>{truncateText(summary, Math.max(24, width - 4))}</Text>
      {themeNotice ? (
        <Text {...theme.notificationTone('warning')}>
          {truncateText(themeNotice, Math.max(24, width - 4))}
        </Text>
      ) : null}
      {shortcutHints.length > 0 ? (
        <Text {...theme.role('muted')}>{truncateText(shortcutHints.join('  '), Math.max(24, width - 4))}</Text>
      ) : null}
    </Box>
  );
}
