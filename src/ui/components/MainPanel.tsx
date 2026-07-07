import React from 'react';
import { Box, Text } from 'ink';
import type { RunOutputRow, RunSummary } from '../../db/repo.js';
import type { PendingApproval } from '../hooks/useGates.js';
import type { FeatureCatalogEntry } from '../catalog.js';
import type { LayoutMode } from '../format.js';
import {
  STATUS_COLOR,
  STATUS_ICON,
  formatClock,
  formatElapsed,
  formatTokens,
  getRunStageLabel,
  getRunStatusLabel,
  truncateText,
} from '../format.js';
import { EmptyState } from './EmptyState.js';
import { RunTable } from './RunTable.js';
import { formatDurationMs, type RunBreakdown } from '../../core/stats.js';

export type ActiveView = 'overview' | 'run';

interface Props {
  runs: RunSummary[];
  gates: PendingApproval[];
  selectedRun: RunSummary | null;
  selectedFeature: FeatureCatalogEntry | null;
  activeView: ActiveView;
  output: RunOutputRow[];
  outputPaused: boolean;
  mode: LayoutMode;
  width: number;
  pendingFeatures: FeatureCatalogEntry[];
  selectedPendingIndex: number;
  breakdown?: RunBreakdown | null;
}

function overviewSummary(runs: RunSummary[], gates: PendingApproval[]): React.ReactElement {
  const running = runs.filter((run) => run.status === 'running').length;
  const done = runs.filter((run) => run.status === 'done').length;
  const failed = runs.filter((run) => run.status === 'failed').length;
  const blocked = runs.filter((run) => run.status === 'blocked').length;
  const aborted = runs.filter((run) => run.status === 'aborted').length;

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
      <Text color="magenta">{aborted} aborted</Text>
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
  output,
  outputPaused,
  mode,
  width,
  pendingFeatures,
  selectedPendingIndex,
  breakdown = null,
}: Props): React.ReactElement {
  const innerWidth = Math.max(32, width - 4);
  const visibleOutput = output.slice(-(mode === 'stacked' ? 8 : 14));
  const lastOutput = visibleOutput[visibleOutput.length - 1] ?? null;
  const maxPending = mode === 'stacked' ? 3 : 5;
  const nextDemands = collectNextDemands(runs);
  const selectedRunStage = selectedRun ? getRunStageLabel(selectedRun) : null;
  const selectedRunStatusLabel = selectedRun ? getRunStatusLabel(selectedRun) : null;

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
      {runs.length === 0 && pendingFeatures.length === 0 ? (
        <EmptyState />
      ) : activeView === 'run' && selectedRun ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{selectedFeature?.title ?? selectedRun.featureId}</Text>
          <Text dimColor>{selectedRun.featureId} · {selectedRun.repoId}</Text>
          <Box marginTop={1}>
            <Text color={STATUS_COLOR[selectedRun.status]}>{STATUS_ICON[selectedRun.status]} {selectedRunStatusLabel}</Text>
            <Text dimColor> | tool {selectedFeature?.model ?? selectedRun.tool}</Text>
            {selectedFeature && <Text dimColor> | effort {selectedFeature.effort}</Text>}
            <Text dimColor> | duration {formatElapsed(selectedRun.startedAt, selectedRun.endedAt)}</Text>
          </Box>
          {(selectedRunStage || selectedRun.pendingStageRequestPrompt) && (
            <Box>
              {selectedRunStage && <Text dimColor>stage {selectedRunStage}</Text>}
              {selectedRun.pendingStageRequestPrompt && (
                <Text dimColor> | wait {truncateText(selectedRun.pendingStageRequestPrompt, Math.max(16, innerWidth - 20))}</Text>
              )}
            </Box>
          )}
          <Box>
            <Text dimColor>started {formatClock(selectedRun.startedAt)}</Text>
            <Text dimColor> | ended {formatClock(selectedRun.endedAt)}</Text>
            <Text dimColor> | tokens {formatTokens(selectedRun.totalTokens)}</Text>
          </Box>
          {breakdown && breakdown.wallMs !== null && (
            <Box>
              <Text dimColor>agent {formatDurationMs(breakdown.agentMs)}</Text>
              {breakdown.gateWaitMs > 0 && (
                <Text dimColor> | gate wait {formatDurationMs(breakdown.gateWaitMs)}</Text>
              )}
              {breakdown.retryCount > 0 && (
                <Text dimColor> | retry {formatDurationMs(breakdown.retryWaitMs)} ({breakdown.retryCount}x)</Text>
              )}
            </Box>
          )}
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
            <Text bold>Pipeline</Text>
            <Text dimColor>
              {selectedRun.pipelineResumeSummary
                ? truncateText(selectedRun.pipelineResumeSummary, Math.max(24, innerWidth - 2))
                : 'No pending pipeline demands recorded for this run.'}
            </Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold>Live output</Text>
            <Text dimColor>
              {selectedRun.status === 'running'
                ? outputPaused
                  ? 'Auto-scroll paused. Press Ctrl+S to resume live tailing.'
                  : lastOutput?.source === 'heartbeat'
                    ? 'Agent thinking... heartbeat received while waiting for the next visible event.'
                    : 'Streaming latest run events in real time.'
                : 'Run finished. Tail below shows the latest captured output.'}
            </Text>
            <Box marginTop={1} flexDirection="column">
              {visibleOutput.length > 0 ? (
                visibleOutput.map((entry) => (
                  <Text key={entry.id} color={getOutputColor(entry)} dimColor={entry.source === 'tool' || entry.source === 'heartbeat'}>
                    {formatOutputPrefix(entry)} {truncateText(entry.line, Math.max(24, innerWidth - 4))}
                  </Text>
                ))
              ) : (
                <Text dimColor>
                  {selectedRun.status === 'running'
                    ? 'Agent thinking... waiting for the first streamed line.'
                    : 'No output captured for this run yet.'}
                </Text>
              )}
            </Box>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {runs.length > 0 && overviewSummary(runs, gates)}
          {runs.length > 0 && (
            <Text dimColor>
              Select a run with arrows or j/k, then press Enter to inspect it. Esc returns here.
            </Text>
          )}
          {runs.length > 0 && (
            <Box marginTop={1}>
              <RunTable runs={runs} width={innerWidth} />
            </Box>
          )}
          {nextDemands.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text bold>Next demands</Text>
              {nextDemands.slice(0, mode === 'stacked' ? 3 : 5).map((entry) => (
                <Text key={entry} dimColor>{truncateText(entry, Math.max(24, innerWidth - 2))}</Text>
              ))}
            </Box>
          )}
          {pendingFeatures.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text bold color="yellow">Ready to start</Text>
              {pendingFeatures.slice(0, maxPending).map((feature, index) => {
                const selected = index === selectedPendingIndex;
                return (
                  <Box key={feature.id}>
                    <Text color={selected ? 'cyan' : undefined} bold={selected}>
                      {selected ? '>' : ' '} {truncateText(`${feature.id}  ${feature.title}`, Math.max(24, innerWidth - 4))}
                    </Text>
                    {selected && (
                      <Text dimColor> [{feature.model ?? feature.tool} / {feature.effort}]</Text>
                    )}
                  </Box>
                );
              })}
              {pendingFeatures.length > maxPending && (
                <Text dimColor>  +{pendingFeatures.length - maxPending} more in backlog</Text>
              )}
              <Text dimColor>  Press n to start the selected feature</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

function formatOutputPrefix(entry: RunOutputRow): string {
  switch (entry.source) {
    case 'agent':
      return 'AI>';
    case 'tool':
      return 'TOOL>';
    case 'heartbeat':
      return '...';
    case 'stderr':
      return 'ERR>';
    default:
      return 'OUT>';
  }
}

function getOutputColor(entry: RunOutputRow): 'white' | 'cyan' | 'gray' | 'red' {
  switch (entry.source) {
    case 'agent':
      return 'white';
    case 'tool':
      return 'cyan';
    case 'heartbeat':
      return 'gray';
    case 'stderr':
      return 'red';
    default:
      return 'white';
  }
}

function collectNextDemands(runs: RunSummary[]): string[] {
  const seen = new Set<string>();
  const next = runs
    .map((run) => {
      const summary = run.pipelineResumeSummary?.trim();
      if (!summary || !summary.includes('next ')) return null;
      return `${run.featureId}: ${summary}`;
    })
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
  return next;
}
