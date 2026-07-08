import React from 'react';
import { Box, Text } from 'ink';
import type { RunOutputRow, RunSummary, TaskRun } from '../../db/repo.js';
import type { PendingApproval } from '../hooks/useGates.js';
import type { NotificationEntry } from '../hooks/useNotifications.js';
import type { FeatureCatalogEntry } from '../catalog.js';
import type { LayoutMode } from '../format.js';
import {
  STATUS_ICON,
  formatClock,
  formatElapsed,
  formatPercent,
  formatTokens,
  getRunStatusTone,
  getRunStageLabel,
  getRunStatusLabel,
  truncateText,
} from '../format.js';
import { EmptyState } from './EmptyState.js';
import { NotificationsFeed } from './NotificationsFeed.js';
import { RunTable } from './RunTable.js';
import { formatDurationMs, type RunBreakdown } from '../../core/stats.js';
import { summarizeTaskRuns } from '../workflow.js';
import { useTheme } from '../theme/context.js';
import {
  getOutputStyle,
  getSurfaceBorderStyle,
  getSurfaceTitleStyle,
  getWorkflowRole,
} from '../theme/styles.js';
import type { ThemeRoleName } from '../theme/types.js';

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

function overviewSummary(
  theme: ReturnType<typeof useTheme>,
  runs: RunSummary[],
  gates: PendingApproval[],
): React.ReactElement {
  const running = runs.filter((run) => run.status === 'running').length;
  const done = runs.filter((run) => run.status === 'done').length;
  const failed = runs.filter((run) => run.status === 'failed').length;
  const blocked = runs.filter((run) => run.status === 'blocked').length;
  const aborted = runs.filter((run) => run.status === 'aborted').length;

  return (
    <Box marginBottom={1}>
      <Text {...theme.statusTone('running')}>{running} running</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.statusTone('done')}>{done} done</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.statusTone('failed')}>{failed} failed</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.statusTone('blocked')}>{blocked} blocked</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.statusTone('aborted')}>{aborted} aborted</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.role('text')}>{gates.length} approvals pending</Text>
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
  const theme = useTheme();
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
  const pipelineTokens = selectedRun?.pipelineTotalTokens ?? selectedRun?.totalTokens ?? null;
  const sessionTokens = selectedRun?.totalTokens ?? null;
  const contextLabel = selectedRun?.contextWindowTokens
    ? `${formatPercent(selectedRun.contextWindowPercent)} of ${formatTokens(selectedRun.contextWindowTokens)}`
    : '—';

  return (
    <Box
      borderStyle="round"
      {...getSurfaceBorderStyle(theme)}
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      width={width}
      marginRight={mode === 'stacked' ? 0 : 1}
      marginBottom={mode === 'stacked' ? 1 : 0}
    >
      <Text {...getSurfaceTitleStyle(theme)}>
        {activeView === 'notifications' ? 'Notifications' : activeView === 'run' && selectedRun ? 'Run Detail' : 'Overview'}
      </Text>
      {runs.length === 0 && pendingFeatures.length === 0 ? (
        <EmptyState />
      ) : activeView === 'notifications' ? (
        <Box flexDirection="column" marginTop={1}>
          <Text {...theme.role('muted')}>
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
          <Text {...theme.role('text')} bold>{selectedFeature?.title ?? selectedRun.featureId}</Text>
          <Text {...theme.role('muted')}>{selectedRun.featureId} · {selectedRun.repoId}</Text>
          <Box
            marginTop={1}
            flexDirection={mode === 'stacked' ? 'column' : 'row'}
          >
            <DetailMetric
              theme={theme}
              label="Status"
              value={`${STATUS_ICON[selectedRun.status]} ${selectedRunStatusLabel}`}
              accentRole={theme.resolution.profile.statusRoleByRun[getRunStatusTone(selectedRun.status)]}
              width={mode === 'stacked' ? innerWidth : Math.max(16, Math.floor(innerWidth / 4) - 1)}
            />
            <DetailMetric
              theme={theme}
              label="Tool"
              value={selectedFeature?.model ?? selectedRun.tool}
              width={mode === 'stacked' ? innerWidth : Math.max(14, Math.floor(innerWidth / 4) - 1)}
            />
            <DetailMetric
              theme={theme}
              label="Session Tokens"
              value={formatTokens(sessionTokens)}
              width={mode === 'stacked' ? innerWidth : Math.max(14, Math.floor(innerWidth / 4) - 1)}
            />
            <DetailMetric
              theme={theme}
              label="Pipeline Tokens"
              value={formatTokens(pipelineTokens)}
              width={mode === 'stacked' ? innerWidth : Math.max(14, Math.floor(innerWidth / 4) - 1)}
            />
            <DetailMetric
              theme={theme}
              label="Context"
              value={contextLabel}
              width={mode === 'stacked' ? innerWidth : Math.max(18, Math.floor(innerWidth / 4) - 1)}
            />
            <DetailMetric
              theme={theme}
              label="Elapsed"
              value={formatElapsed(selectedRun.startedAt, selectedRun.endedAt)}
              width={mode === 'stacked' ? innerWidth : Math.max(14, Math.floor(innerWidth / 4) - 1)}
            />
          </Box>
          <Box
            marginTop={1}
            flexDirection={mode === 'stacked' ? 'column' : 'row'}
          >
            <Box flexDirection="column" width={leftColumnWidth} marginRight={mode === 'stacked' ? 0 : 2}>
              <DetailSection theme={theme} title="Run Summary" width={leftColumnWidth}>
                <Text {...theme.role('muted')}>started {formatClock(selectedRun.startedAt)}  ·  ended {formatClock(selectedRun.endedAt)}</Text>
                {selectedFeature && <Text {...theme.role('muted')}>effort {selectedFeature.effort}</Text>}
                {selectedRunStage && <Text {...theme.role('muted')}>stage {selectedRunStage}</Text>}
                <Text {...theme.role('muted')}>
                  session {formatTokens(sessionTokens)}  ·  pipeline {formatTokens(pipelineTokens)}
                </Text>
                {selectedRun.contextWindowTokens ? (
                  <Text {...theme.role('muted')}>
                    context {formatPercent(selectedRun.contextWindowPercent)} of {formatTokens(selectedRun.contextWindowTokens)}
                  </Text>
                ) : null}
                {selectedRun.pendingStageRequestPrompt && (
                  <Text {...theme.role('muted')}>
                    wait {truncateText(selectedRun.pendingStageRequestPrompt, Math.max(22, leftColumnWidth - 6))}
                  </Text>
                )}
                {breakdown && breakdown.wallMs !== null && (
                  <>
                    <Text {...theme.role('muted')}>agent {formatDurationMs(breakdown.agentMs)}</Text>
                    {breakdown.gateWaitMs > 0 && <Text {...theme.role('muted')}>gate wait {formatDurationMs(breakdown.gateWaitMs)}</Text>}
                    {breakdown.retryCount > 0 && (
                      <Text {...theme.role('muted')}>retry wait {formatDurationMs(breakdown.retryWaitMs)} ({breakdown.retryCount}x)</Text>
                    )}
                  </>
                )}
              </DetailSection>
              <Box marginTop={1}>
                <DetailSection theme={theme} title="Workflow" width={leftColumnWidth}>
                  {workflowStages.length > 0 ? (
                    workflowStages.map((stage) => (
                      <Box key={stage.stage} flexDirection="column" marginBottom={1}>
                        <Text {...theme.role(getWorkflowRole(stage))}>
                          {stage.stage}  {stage.done}/{stage.total} done
                        </Text>
                        <Text {...theme.role('muted')}>
                          {[
                            stage.totalTokens > 0 ? `${formatTokens(stage.totalTokens)} tokens` : null,
                            stage.maxContextPercent !== null ? `${formatPercent(stage.maxContextPercent)} ctx` : null,
                            stage.running > 0 ? `${stage.running} active` : null,
                            stage.pending > 0 ? `${stage.pending} pending` : null,
                            stage.blocked > 0 ? `${stage.blocked} blocked` : null,
                            stage.failed > 0 ? `${stage.failed} failed` : null,
                            stage.skipped > 0 ? `${stage.skipped} skipped` : null,
                          ].filter(Boolean).join('  ·  ') || 'completed'}
                        </Text>
                        {stage.tasks.slice(0, 2).map((task, index) => (
                          <Text key={`${stage.stage}:${task.taskId}:${index}`} {...theme.role('muted')}>
                            {task.status === 'running' ? '>' : '-'} {truncateText(
                              [
                                task.title,
                                task.totalTokens ? `${formatTokens(task.totalTokens)} tokens` : null,
                                task.contextWindowPercent !== null && task.contextWindowPercent !== undefined
                                  ? `${formatPercent(task.contextWindowPercent)} ctx`
                                  : null,
                              ].filter(Boolean).join('  ·  '),
                              Math.max(20, leftColumnWidth - 6),
                            )}
                          </Text>
                        ))}
                      </Box>
                    ))
                  ) : (
                    <Text {...theme.role('muted')}>
                      {selectedRun.pipelineResumeSummary
                        ? truncateText(selectedRun.pipelineResumeSummary, Math.max(24, leftColumnWidth - 4))
                        : 'No workflow steps recorded for this run yet.'}
                    </Text>
                  )}
                </DetailSection>
              </Box>
              <Box marginTop={1}>
                <DetailSection theme={theme} title="Declared Skills" width={leftColumnWidth}>
                  {selectedFeature?.skills?.length ? (
                    selectedFeature.skills.map((skill, index) => (
                      <Text key={`${skill}:${index}`} {...theme.role('success')}>
                        - {skill}
                      </Text>
                    ))
                  ) : (
                    <Text {...theme.role('muted')}>No backlog skill metadata found for this run.</Text>
                  )}
                </DetailSection>
              </Box>
            </Box>
            <Box flexDirection="column" width={rightColumnWidth}>
              <DetailSection theme={theme} title="Live Output" width={rightColumnWidth}>
                {logsVisible ? (
                  <>
                    <Text {...theme.role('muted')}>
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
                          <Text key={entry.id} {...getOutputStyle(theme, entry.source)}>
                            {formatOutputPrefix(entry)} {truncateText(entry.line, Math.max(28, rightColumnWidth - 6))}
                          </Text>
                        ))
                      ) : (
                        <Text {...theme.role('muted')}>
                          {selectedRun.status === 'running'
                            ? 'Agent thinking... waiting for the first streamed line.'
                            : 'No output captured for this run yet.'}
                        </Text>
                      )}
                    </Box>
                  </>
                ) : (
                  <Text {...theme.role('muted')}>Logs hidden. Press Ctrl+L to reopen the live output view.</Text>
                )}
              </DetailSection>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {runs.length > 0 && overviewSummary(theme, runs, gates)}
          {runs.length > 0 && (
            <Text {...theme.role('muted')}>
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
              <Text {...theme.role('text')} bold>Next demands</Text>
              {nextDemands.slice(0, mode === 'stacked' ? 3 : 5).map((entry, index) => (
                <Text key={`${index}:${entry}`} {...theme.role('muted')}>{truncateText(entry, Math.max(24, innerWidth - 2))}</Text>
              ))}
            </Box>
          )}
          {pendingFeatures.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text {...(focusPanel === 'main' ? theme.role('focus') : theme.role('warning'))} bold>
                {focusPanel === 'main' ? '> ' : '  '}Ready to start
              </Text>
              {pendingFeatures.slice(0, maxPending).map((feature, index) => {
                const selected = focusPanel === 'main' && index === selectedPendingIndex;
                return (
                  <Box key={feature.id}>
                    <Text {...(selected ? theme.role('focus') : theme.role('text'))} bold={selected}>
                      {selected ? '>' : ' '} {truncateText(`${feature.id}  ${feature.title}`, Math.max(24, innerWidth - 4))}
                    </Text>
                    {selected && (
                      <Text {...theme.role('muted')}> [{feature.model ?? feature.tool} / {feature.effort}]</Text>
                    )}
                  </Box>
                );
              })}
              {pendingFeatures.length > maxPending && (
                <Text {...theme.role('muted')}>  +{pendingFeatures.length - maxPending} more in backlog</Text>
              )}
              <Text {...theme.role('muted')}>  Tab to focus · j/k to select · Enter or n to start</Text>
            </Box>
          )}
          {notifications.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text {...theme.role('text')} bold>Recent activity</Text>
              <NotificationsFeed
                notifications={notifications}
                maxVisible={mode === 'stacked' ? 4 : 6}
                width={innerWidth}
                compact
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

function DetailMetric({
  theme,
  label,
  value,
  width,
  accentRole,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  value: string;
  width: number;
  accentRole?: ThemeRoleName;
}): React.ReactElement {
  const accentStyle = accentRole ? theme.role(accentRole) : theme.role('text');
  return (
    <Box
      borderStyle="round"
      borderColor={accentStyle.color ?? theme.surface.borderColor}
      flexDirection="column"
      paddingX={1}
      width={width}
      marginRight={1}
      marginBottom={1}
    >
      <Text {...theme.role('muted')}>{label}</Text>
      <Text {...accentStyle}>{value}</Text>
    </Box>
  );
}

function DetailSection({
  theme,
  title,
  width,
  children,
}: {
  theme: ReturnType<typeof useTheme>;
  title: string;
  width: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box borderStyle="round" {...getSurfaceBorderStyle(theme, { role: 'muted' })} paddingX={1} flexDirection="column" width={width}>
      <Text {...theme.role('text')} bold>{title}</Text>
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
