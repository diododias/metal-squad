import React from 'react';
import { Box, Text } from 'ink';
import type { RunningTaskSummary, RunOutputRow, RunSummary, TaskRun } from '../../db/repo.js';
import type { PendingApproval } from '../hooks/useGates.js';
import type { NotificationEntry } from '../hooks/useNotifications.js';
import type { FeatureCatalogEntry } from '../catalog.js';
import type { LayoutMode } from '../format.js';
import {
  STATUS_ICON,
  formatClock,
  formatElapsed,
  formatPercent,
  formatHeartbeatLine,
  formatTokens,
  getRunStatusTone,
  getRunStageLabel,
  getRunStatusLabel,
  truncateText,
} from '../format.js';
import { DASHBOARD_GROUP_LABEL, DASHBOARD_GROUP_ORDER, getRunGroup, type DashboardGroupId } from '../dashboardGroups.js';
import { EmptyState } from './EmptyState.js';
import { NotificationsFeed } from './NotificationsFeed.js';
import { RunTable } from './RunTable.js';
import { formatDurationMs, type RunBreakdown } from '../../core/stats.js';
import { summarizeTaskRuns, type WorkflowStageSummary } from '../workflow.js';
import { useTheme } from '../theme/context.js';
import {
  getOutputStyle,
  getSurfaceBorderStyle,
  getSurfaceTitleStyle,
  getWorkflowRole,
} from '../theme/styles.js';
import type { ThemeRoleName } from '../theme/types.js';

export type ActiveView = 'overview' | 'run' | 'notifications';

const BACKLOG_TASK_ICON: Record<string, string> = {
  todo: '○',
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '!',
};

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
  runningTasks?: RunningTaskSummary[];
  notifications?: NotificationEntry[];
}

// C3: cross-run "In Progress Tasks" feed shown directly on the dashboard,
// not just once a run is opened in the detail screen.
function inProgressTasksSection(
  theme: ReturnType<typeof useTheme>,
  runningTasks: RunningTaskSummary[],
  innerWidth: number,
  maxVisible: number,
): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text {...theme.role('text')} bold>In Progress Tasks</Text>
      {runningTasks.slice(0, maxVisible).map((task) => (
        <Text key={`${task.runId}:${task.taskId}`} {...theme.role('muted')}>
          {truncateText(
            `${task.featureId} > ${task.taskId}${task.stage ? ` (${task.stage})` : ''} — ${task.title}`,
            Math.max(24, innerWidth - 2),
          )}
        </Text>
      ))}
    </Box>
  );
}

function stageStatusLabel(stage: WorkflowStageSummary): string {
  if (stage.running > 0) return 'executing';
  if (stage.failed > 0) return 'failed';
  if (stage.blocked > 0) return 'blocked';
  if (stage.total > 0 && stage.done === stage.total) return 'done';
  return 'pending';
}

function localSelectedIndex(slice: RunSummary[], selectedRun: RunSummary | null): number {
  if (!selectedRun) return -1;
  return slice.findIndex((run) => run.runId === selectedRun.runId);
}

// C1 + C2: one ordered block per dashboard group. EXECUTION/BLOCKED renders
// its own rows (rather than reusing RunTable) so the currently selected
// running item can expand inline into its workflow stage tree right under
// that row; DONE/CANCELED reuse RunTable for visual consistency with the
// rest of the app.
function DashboardBlock({
  theme,
  groupId,
  groupRuns,
  selectedRun,
  isRunsFocused,
  innerWidth,
  workflowStages,
}: {
  theme: ReturnType<typeof useTheme>;
  groupId: DashboardGroupId;
  groupRuns: RunSummary[];
  selectedRun: RunSummary | null;
  isRunsFocused: boolean;
  innerWidth: number;
  workflowStages: WorkflowStageSummary[];
}): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text {...theme.role('text')} bold>{DASHBOARD_GROUP_LABEL[groupId]}</Text>
      {groupId === 'execution' ? (
        <Box flexDirection="column">
          {groupRuns.map((run) => {
            const isSelected = selectedRun?.runId === run.runId;
            const statusStyle = theme.statusTone(getRunStatusTone(run.status));
            const stageLabel = getRunStageLabel(run);
            return (
              <Box key={run.runId} flexDirection="column" marginBottom={1}>
                <Box>
                  <Text {...(isSelected && isRunsFocused ? theme.role('focus') : theme.role('text'))} bold={isSelected}>
                    {isSelected ? '> ' : '  '}{STATUS_ICON[run.status]} {truncateText(run.featureId, Math.max(16, innerWidth - 30))}
                  </Text>
                  <Text {...statusStyle}>  {run.tool}{stageLabel ? `  ·  ${stageLabel}` : ''}</Text>
                </Box>
                {isSelected && run.status === 'running' && workflowStages.length > 0 && (
                  <Box flexDirection="column" marginLeft={2}>
                    <Text {...theme.role('muted')}>{run.featureId} {'>'}</Text>
                    {workflowStages.map((stage) => (
                      <Text key={stage.stage} {...theme.role(getWorkflowRole(stage))}>
                        {'  |_ '}{stage.stage} {stageStatusLabel(stage)}
                      </Text>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      ) : (
        <RunTable
          runs={groupRuns}
          width={innerWidth}
          selectedIndex={localSelectedIndex(groupRuns, selectedRun)}
          isFocused={isRunsFocused}
        />
      )}
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
  runningTasks = [],
  notifications = [],
}: Props): React.ReactElement {
  const theme = useTheme();
  const innerWidth = Math.max(32, width - 4);
  const visibleOutput = output.slice(-(mode === 'stacked' ? 8 : 14));
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
  const metricWidth = mode === 'stacked' ? innerWidth : Math.max(11, Math.floor(innerWidth / 7) - 1);
  const declaredTasks = selectedFeature?.tasks ?? [];

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
              width={metricWidth}
            />
            {/* D3: Tool (the adapter — claude/codex/opencode) and Model are
                distinct facts. They used to share one "Tool"-labelled card
                that actually preferred the model, hiding which adapter ran
                the feature. Two separate cards fix that. */}
            <DetailMetric
              theme={theme}
              label="Tool"
              value={selectedRun.tool}
              width={metricWidth}
            />
            <DetailMetric
              theme={theme}
              label="Model"
              value={selectedFeature?.model ?? '—'}
              width={metricWidth}
            />
            <DetailMetric
              theme={theme}
              label="Session Tokens"
              value={formatTokens(sessionTokens)}
              width={metricWidth}
            />
            <DetailMetric
              theme={theme}
              label="Pipeline Tokens"
              value={formatTokens(pipelineTokens)}
              width={metricWidth}
            />
            <DetailMetric
              theme={theme}
              label="Context"
              value={contextLabel}
              width={metricWidth}
            />
            <DetailMetric
              theme={theme}
              label="Elapsed"
              value={formatElapsed(selectedRun.startedAt, selectedRun.endedAt)}
              width={metricWidth}
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
              {/* D2: full spec/feature description — the bare feat-xxx id
                  plus a one-line title was not enough context. Pulled from
                  the backlog's inline `spec` summary or `specFile` doc. */}
              <Box marginTop={1}>
                <DetailSection theme={theme} title="Feature Spec" width={leftColumnWidth}>
                  {selectedFeature?.description ? (
                    selectedFeature.description
                      .split('\n')
                      .slice(0, mode === 'stacked' ? 8 : 14)
                      .map((line, index) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <Text key={index} {...theme.role('muted')}>
                          {truncateText(line || ' ', Math.max(24, leftColumnWidth - 4))}
                        </Text>
                      ))
                  ) : (
                    <Text {...theme.role('muted')}>
                      No spec or specFile declared for {selectedRun.featureId} in the backlog.
                    </Text>
                  )}
                </DetailSection>
              </Box>
              {/* D1: this is now the only place the workflow board renders —
                  the sidebar used to show a duplicate summary of the same
                  stages. */}
              <Box marginTop={1}>
                <DetailSection theme={theme} title="Workflow" width={leftColumnWidth}>
                  {workflowStages.length > 0 ? (
                    workflowStages.map((stage) => (
                      <Box key={stage.stage} flexDirection="column" marginBottom={1}>
                        <Text {...theme.role(getWorkflowRole(stage))}>
                          {stage.stage}  {stage.done}/{stage.total} done  ({stageStatusLabel(stage)})
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
              {/* D4: the declared task breakdown (backlog building blocks),
                  distinct from the live Workflow section above (which
                  tracks execution stage instances, not the backlog plan). */}
              <DetailSection theme={theme} title="Tasks" width={rightColumnWidth}>
                {declaredTasks.length > 0 ? (
                  declaredTasks.slice(0, mode === 'stacked' ? 6 : 10).map((task) => (
                    <Text key={task.id} {...theme.role('muted')}>
                      {BACKLOG_TASK_ICON[task.status] ?? '○'} {task.id} — {truncateText(task.title, Math.max(20, rightColumnWidth - 12))}
                    </Text>
                  ))
                ) : (
                  <Text {...theme.role('muted')}>No task breakdown declared for {selectedRun.featureId} in the backlog.</Text>
                )}
              </DetailSection>
              <Box marginTop={1}>
                <DetailSection theme={theme} title="Live Output" width={rightColumnWidth}>
                  {logsVisible ? (
                    <>
                      <Text {...theme.role('muted')}>
                        {selectedRun.status === 'running'
                          ? outputPaused
                            ? 'Auto-scroll paused. Press Ctrl+S to resume live tailing.'
                            : visibleOutput[visibleOutput.length - 1]?.source === 'heartbeat'
                              ? 'Agent thinking... heartbeat received while waiting for the next visible event.'
                              : 'Streaming latest run events in real time.'
                          : 'Run finished. Tail below shows the latest captured output.'}
                      </Text>
                      <Box marginTop={1} flexDirection="column">
                        {visibleOutput.length > 0 ? (
                          visibleOutput.map((entry) => renderOutputEntry(theme, entry, Math.max(28, rightColumnWidth - 6)))
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
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {runningTasks.length > 0 && inProgressTasksSection(theme, runningTasks, innerWidth, mode === 'stacked' ? 4 : 6)}
          {runs.length > 0 && (
            <Text {...theme.role('muted')}>
              Select a run with arrows or j/k, then press Enter to inspect it. Esc returns here.
            </Text>
          )}
          {/* C1: rigid ordered blocks — EXECUTION/BLOCKED, TODO, DONE,
              CANCELED — instead of one flat table plus a disconnected
              "Ready to start" list. Empty blocks are skipped rather than
              shown as empty headers. */}
          {DASHBOARD_GROUP_ORDER.map((groupId) => {
            if (groupId === 'todo') {
              if (pendingFeatures.length === 0) return null;
              return (
                <Box key={groupId} marginTop={1} flexDirection="column">
                  <Text {...(focusPanel === 'main' ? theme.role('focus') : theme.role('text'))} bold>
                    {focusPanel === 'main' ? '> ' : '  '}{DASHBOARD_GROUP_LABEL.todo}
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
              );
            }

            const groupRuns = runs.filter((run) => getRunGroup(run.status) === groupId);
            if (groupRuns.length === 0) return null;
            return (
              <DashboardBlock
                key={groupId}
                theme={theme}
                groupId={groupId}
                groupRuns={groupRuns}
                selectedRun={selectedRun}
                isRunsFocused={focusPanel === 'runs'}
                innerWidth={innerWidth}
                workflowStages={workflowStages}
              />
            );
          })}
          {nextDemands.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text {...theme.role('text')} bold>Next demands</Text>
              {nextDemands.slice(0, mode === 'stacked' ? 3 : 5).map((entry, index) => (
                <Text key={`${index}:${entry}`} {...theme.role('muted')}>{truncateText(entry, Math.max(24, innerWidth - 2))}</Text>
              ))}
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

// D5: AI log rendering. `AI>` and `TOOL>` prefixes are hidden entirely — the
// color palette (getOutputStyle) already distinguishes sources. TOOL output
// renders inside a bordered block (a markdown-fenced-code-block look, since
// Ink has no real Markdown renderer) instead of an inline prefixed line.
// Heartbeat lines go through formatHeartbeatLine so a long raw diagnostic
// string (`[msq] codex running for 42s (stdout 1B stderr 0B idle 0s)`)
// condenses into a short line instead of being truncated mid-word.
function renderOutputEntry(
  theme: ReturnType<typeof useTheme>,
  entry: RunOutputRow,
  maxWidth: number,
): React.ReactElement {
  if (entry.source === 'tool') {
    return (
      <Box
        key={entry.id}
        borderStyle="round"
        borderColor={getOutputStyle(theme, 'tool').color ?? theme.surface.borderColor}
        paddingX={1}
        marginBottom={1}
        flexDirection="column"
      >
        <Text {...getOutputStyle(theme, 'tool')}>{truncateText(entry.line, maxWidth)}</Text>
      </Box>
    );
  }

  if (entry.source === 'heartbeat') {
    return (
      <Text key={entry.id} {...getOutputStyle(theme, 'heartbeat')}>
        {formatHeartbeatLine(entry.line, maxWidth)}
      </Text>
    );
  }

  if (entry.source === 'stderr') {
    return (
      <Text key={entry.id} {...getOutputStyle(theme, 'stderr')}>
        {'ERR> '}{truncateText(entry.line, maxWidth)}
      </Text>
    );
  }

  // 'agent' (and any other/default source): prefix hidden per D5.
  return (
    <Text key={entry.id} {...getOutputStyle(theme, entry.source)}>
      {truncateText(entry.line, maxWidth)}
    </Text>
  );
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
