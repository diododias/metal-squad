import React from 'react';
import { Box, Text } from 'ink';
import type { RunOutputRow, RunSummary, TaskRun } from '../../db/repo.js';
import type { PendingApproval } from '../hooks/useGates.js';
import type { NotificationEntry } from '../hooks/useNotifications.js';
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
import { NotificationsFeed } from './NotificationsFeed.js';
import { RunTable } from './RunTable.js';
import { formatDurationMs, type RunBreakdown } from '../../core/stats.js';
import { summarizeTaskRuns } from '../workflow.js';

export type ActiveView = 'overview' | 'run' | 'notifications';

interface Props {
  runs: RunSummary[];
  gates: PendingApproval[];
  selectedRun: RunSummary | null;
  selectedRunIndex: number;
  selectedFeature: FeatureCatalogEntry | null;
  activeView: ActiveView;
  output: RunOutputRow[];
  outputPaused: boolean;
  logsVisible: boolean;
  focusPanel: 'runs' | 'gates' | 'main';
  mode: LayoutMode;
  width: number;
  pendingFeatures: FeatureCatalogEntry[];
  selectedPendingIndex: number;
  breakdown?: RunBreakdown | null;
  taskRuns?: TaskRun[];
  notifications?: NotificationEntry[];
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
  selectedRunIndex,
  selectedFeature,
  activeView,
  output,
  outputPaused,
  logsVisible,
  focusPanel,
  mode,
  width,
  pendingFeatures,
  selectedPendingIndex,
  breakdown = null,
  taskRuns = [],
  notifications = [],
}: Props): React.ReactElement {
  const innerWidth = Math.max(32, width - 4);
  const visibleOutput = output.slice(-(mode === 'stacked' ? 8 : 14));
  const lastOutput = visibleOutput[visibleOutput.length - 1] ?? null;
  const maxPending = mode === 'stacked' ? 3 : 5;
  const nextDemands = collectNextDemands(runs);
  const selectedRunStage = selectedRun ? getRunStageLabel(selectedRun) : null;
  const selectedRunStatusLabel = selectedRun ? getRunStatusLabel(selectedRun) : null;
  const workflowStages = summarizeTaskRuns(taskRuns);
  const leftColumnWidth = mode === 'stacked' ? innerWidth : Math.max(28, Math.floor(innerWidth * 0.42));
  const rightColumnWidth = mode === 'stacked' ? innerWidth : Math.max(34, innerWidth - leftColumnWidth - 2);

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
        {activeView === 'notifications' ? 'Notifications' : activeView === 'run' && selectedRun ? 'Run Detail' : 'Overview'}
      </Text>
      {runs.length === 0 && pendingFeatures.length === 0 ? (
        <EmptyState />
      ) : activeView === 'notifications' ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>
            Recent automation, gate, and stage events across the board.
          </Text>
          <Box marginTop={1}>
            <NotificationsFeed
              notifications={notifications}
              maxVisible={mode === 'stacked' ? 10 : 24}
              width={innerWidth}
            />
          </Box>
        </Box>
      ) : activeView === 'run' && selectedRun ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>{selectedFeature?.title ?? selectedRun.featureId}</Text>
          <Text dimColor>{selectedRun.featureId} · {selectedRun.repoId}</Text>
          <Box
            marginTop={1}
            flexDirection={mode === 'stacked' ? 'column' : 'row'}
          >
            <DetailMetric
              label="Status"
              value={`${STATUS_ICON[selectedRun.status]} ${selectedRunStatusLabel}`}
              accent={STATUS_COLOR[selectedRun.status]}
              width={mode === 'stacked' ? innerWidth : Math.max(16, Math.floor(innerWidth / 4) - 1)}
            />
            <DetailMetric
              label="Tool"
              value={selectedFeature?.model ?? selectedRun.tool}
              width={mode === 'stacked' ? innerWidth : Math.max(14, Math.floor(innerWidth / 4) - 1)}
            />
            <DetailMetric
              label="Elapsed"
              value={formatElapsed(selectedRun.startedAt, selectedRun.endedAt)}
              width={mode === 'stacked' ? innerWidth : Math.max(14, Math.floor(innerWidth / 4) - 1)}
            />
            <DetailMetric
              label="Tokens"
              value={formatTokens(selectedRun.totalTokens)}
              width={mode === 'stacked' ? innerWidth : Math.max(14, Math.floor(innerWidth / 4) - 1)}
            />
          </Box>
          <Box
            marginTop={1}
            flexDirection={mode === 'stacked' ? 'column' : 'row'}
          >
            <Box flexDirection="column" width={leftColumnWidth} marginRight={mode === 'stacked' ? 0 : 2}>
              <DetailSection title="Run Summary" width={leftColumnWidth}>
                <Text dimColor>started {formatClock(selectedRun.startedAt)}  ·  ended {formatClock(selectedRun.endedAt)}</Text>
                {selectedFeature && <Text dimColor>effort {selectedFeature.effort}</Text>}
                {selectedRunStage && <Text dimColor>stage {selectedRunStage}</Text>}
                {selectedRun.pendingStageRequestPrompt && (
                  <Text dimColor>
                    wait {truncateText(selectedRun.pendingStageRequestPrompt, Math.max(22, leftColumnWidth - 6))}
                  </Text>
                )}
                {breakdown && breakdown.wallMs !== null && (
                  <>
                    <Text dimColor>agent {formatDurationMs(breakdown.agentMs)}</Text>
                    {breakdown.gateWaitMs > 0 && <Text dimColor>gate wait {formatDurationMs(breakdown.gateWaitMs)}</Text>}
                    {breakdown.retryCount > 0 && (
                      <Text dimColor>retry wait {formatDurationMs(breakdown.retryWaitMs)} ({breakdown.retryCount}x)</Text>
                    )}
                  </>
                )}
              </DetailSection>
              <Box marginTop={1}>
                <DetailSection title="Workflow" width={leftColumnWidth}>
                  {workflowStages.length > 0 ? (
                    workflowStages.map((stage) => (
                      <Box key={stage.stage} flexDirection="column" marginBottom={1}>
                        <Text color={stage.running > 0 ? 'cyan' : stage.failed > 0 ? 'red' : stage.blocked > 0 ? 'yellow' : stage.done === stage.total ? 'green' : 'white'}>
                          {stage.stage}  {stage.done}/{stage.total} done
                        </Text>
                        <Text dimColor>
                          {[
                            stage.running > 0 ? `${stage.running} active` : null,
                            stage.pending > 0 ? `${stage.pending} pending` : null,
                            stage.blocked > 0 ? `${stage.blocked} blocked` : null,
                            stage.failed > 0 ? `${stage.failed} failed` : null,
                            stage.skipped > 0 ? `${stage.skipped} skipped` : null,
                          ].filter(Boolean).join('  ·  ') || 'completed'}
                        </Text>
                        {stage.tasks.slice(0, 2).map((task) => (
                          <Text key={task.taskId} dimColor>
                            {task.status === 'running' ? '>' : '-'} {truncateText(task.title, Math.max(20, leftColumnWidth - 6))}
                          </Text>
                        ))}
                      </Box>
                    ))
                  ) : (
                    <Text dimColor>
                      {selectedRun.pipelineResumeSummary
                        ? truncateText(selectedRun.pipelineResumeSummary, Math.max(24, leftColumnWidth - 4))
                        : 'No workflow steps recorded for this run yet.'}
                    </Text>
                  )}
                </DetailSection>
              </Box>
              <Box marginTop={1}>
                <DetailSection title="Declared Skills" width={leftColumnWidth}>
                  {selectedFeature?.skills?.length ? (
                    selectedFeature.skills.map((skill) => (
                      <Text key={skill} color="green">
                        - {skill}
                      </Text>
                    ))
                  ) : (
                    <Text dimColor>No backlog skill metadata found for this run.</Text>
                  )}
                </DetailSection>
              </Box>
            </Box>
            <Box flexDirection="column" width={rightColumnWidth}>
              <DetailSection title="Live Output" width={rightColumnWidth}>
                {logsVisible ? (
                  <>
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
                            {formatOutputPrefix(entry)} {truncateText(entry.line, Math.max(28, rightColumnWidth - 6))}
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
                  </>
                ) : (
                  <Text dimColor>Logs hidden. Press Ctrl+L to reopen the live output view.</Text>
                )}
              </DetailSection>
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
              <RunTable
                runs={runs}
                width={innerWidth}
                selectedIndex={selectedRunIndex}
                isFocused={focusPanel === 'runs'}
              />
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

function DetailMetric({
  label,
  value,
  width,
  accent,
}: {
  label: string;
  value: string;
  width: number;
  accent?: string;
}): React.ReactElement {
  return (
    <Box
      borderStyle="round"
      borderColor={accent ?? 'gray'}
      flexDirection="column"
      paddingX={1}
      width={width}
      marginRight={1}
      marginBottom={1}
    >
      <Text dimColor>{label}</Text>
      <Text color={accent ?? 'white'}>{value}</Text>
    </Box>
  );
}

function DetailSection({
  title,
  width,
  children,
}: {
  title: string;
  width: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column" width={width}>
      <Text bold>{title}</Text>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
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
