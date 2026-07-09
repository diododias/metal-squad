import React from 'react';
import { Box, Text } from 'ink';
import type { RunningTaskSummary, RunOutputRow, RunSummary, TaskRun } from '../../db/repo.js';
import type { PendingApproval } from '../hooks/useGates.js';
import type { NotificationEntry } from '../hooks/useNotifications.js';
import type { BacklogSettings, FeatureCatalogEntry } from '../catalog.js';
import type { LayoutMode, VerticalBudget } from '../format.js';
import {
  STATUS_ICON,
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
import { DETAIL_SECTION_LABEL, DETAIL_SECTION_ORDER, type DetailSectionId } from '../detailSections.js';
import { EmptyState } from './EmptyState.js';
import { FeatureConfigSection } from './FeatureConfigSection.js';
import { FeaturePreview } from './FeaturePreview.js';
import { KanbanCard } from './KanbanCard.js';
import { KanbanColumn } from './KanbanColumn.js';
import { NotificationsFeed } from './NotificationsFeed.js';
import { WorkflowStepper } from './WorkflowStepper.js';
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

export type ActiveView = 'overview' | 'run' | 'notifications' | 'preview';

const BACKLOG_TASK_ICON: Record<string, string> = {
  todo: '○',
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '!',
};

const DEFAULT_STEPPER_STAGES = ['specify', 'plan', 'tasks', 'implement', 'validate'];

interface Props {
  runs: RunSummary[];
  gates: PendingApproval[];
  selectedRun: RunSummary | null;
  selectedRunIndex: number;
  selectedFeature: FeatureCatalogEntry | null;
  featureCatalog?: Record<string, FeatureCatalogEntry>;
  backlogSettings?: BacklogSettings;
  activeView: ActiveView;
  output: RunOutputRow[];
  outputPaused: boolean;
  logsVisible: boolean;
  focusPanel: 'columns' | 'gates' | 'activity';
  activeColumn: DashboardGroupId;
  detailSectionIndex?: number;
  detailPageSize?: number;
  detailDense?: boolean;
  activeTab?: DetailSectionId;
  verticalBudget?: VerticalBudget;
  mode: LayoutMode;
  width: number;
  pendingFeatures: FeatureCatalogEntry[];
  selectedPendingIndex: number;
  breakdown?: RunBreakdown | null;
  taskRuns?: TaskRun[];
  runningTasks?: RunningTaskSummary[];
  notifications?: NotificationEntry[];
}

function stageStatusLabel(stage: WorkflowStageSummary): string {
  if (stage.running > 0) return 'executing';
  if (stage.failed > 0) return 'failed';
  if (stage.blocked > 0) return 'blocked';
  if (stage.total > 0 && stage.done === stage.total) return 'done';
  return 'pending';
}

const COLUMN_EMPTY_LABEL: Record<DashboardGroupId, string> = {
  execution: 'nenhuma em execução',
  todo: 'backlog vazio',
  done: 'nenhuma concluída',
  canceled: 'sem falhas',
};

export function MainPanel({
  runs,
  gates: _gates,
  selectedRun,
  selectedRunIndex: _selectedRunIndex,
  selectedFeature,
  featureCatalog = {},
  backlogSettings = { stageSkills: {} },
  activeView,
  output,
  outputPaused,
  logsVisible,
  focusPanel,
  activeColumn,
  detailSectionIndex = 0,
  detailPageSize = 2,
  detailDense = false,
  activeTab,
  verticalBudget = 'regular',
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
  const maxPerColumn = verticalBudget === 'short'
    ? (mode === 'stacked' ? 2 : 3)
    : verticalBudget === 'tall'
      ? (mode === 'stacked' ? 4 : 6)
      : (mode === 'stacked' ? 3 : 5);
  const columnGap = mode === 'stacked' ? 0 : 1;
  const columnWidth = mode === 'stacked'
    ? innerWidth
    : Math.max(18, Math.floor((innerWidth - columnGap * (DASHBOARD_GROUP_ORDER.length - 1)) / DASHBOARD_GROUP_ORDER.length));
  const nextDemands = collectNextDemands(runs);
  const _selectedRunStage = selectedRun ? getRunStageLabel(selectedRun) : null;
  const selectedRunStatusLabel = selectedRun ? getRunStatusLabel(selectedRun) : null;
  const workflowStages = summarizeTaskRuns(taskRuns, selectedFeature?.workflow?.stages ?? []);
  const visibleDetailSections = activeTab
    ? [activeTab]
    : DETAIL_SECTION_ORDER.slice(detailSectionIndex, detailSectionIndex + detailPageSize);
  const pipelineTokens = selectedRun?.pipelineTotalTokens ?? selectedRun?.totalTokens ?? null;
  const sessionTokens = selectedRun?.totalTokens ?? null;
  const contextLabel = selectedRun?.contextWindowTokens
    ? `${formatPercent(selectedRun.contextWindowPercent)} of ${formatTokens(selectedRun.contextWindowTokens)}`
    : '—';
  const metricWidth = mode === 'stacked' ? innerWidth : Math.max(11, Math.floor(innerWidth / 7) - 1);
  const declaredTasks = selectedFeature?.tasks ?? [];
  const selectedPending = pendingFeatures[selectedPendingIndex] ?? null;

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
        {activeView === 'notifications'
          ? 'Notifications'
          : activeView === 'preview' && selectedPending
            ? 'Preview'
            : activeView === 'run' && selectedRun
              ? 'Run Detail'
              : 'Kanban'}
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
      ) : activeView === 'preview' && selectedPending ? (
        <FeaturePreview feature={selectedPending} settings={backlogSettings} mode={mode} width={innerWidth} />
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
              value={`${STATUS_ICON[selectedRun.status]} ${selectedRunStatusLabel ?? ''}`}
              accentRole={theme.resolution.profile.statusRoleByRun[getRunStatusTone(selectedRun.status)]}
              width={metricWidth}
              stacked={mode === 'stacked'}
            />
            <DetailMetric
              theme={theme}
              label="Tool"
              value={selectedRun.tool}
              width={metricWidth}
              stacked={mode === 'stacked'}
            />
            <DetailMetric
              theme={theme}
              label="Model"
              value={selectedFeature?.model ?? '—'}
              width={metricWidth}
              stacked={mode === 'stacked'}
            />
            <DetailMetric
              theme={theme}
              label="Session Tokens"
              value={formatTokens(sessionTokens)}
              width={metricWidth}
              stacked={mode === 'stacked'}
            />
            <DetailMetric
              theme={theme}
              label="Pipeline Tokens"
              value={formatTokens(pipelineTokens)}
              width={metricWidth}
              stacked={mode === 'stacked'}
            />
            <DetailMetric
              theme={theme}
              label="Context"
              value={contextLabel}
              width={metricWidth}
              stacked={mode === 'stacked'}
            />
            <DetailMetric
              theme={theme}
              label="Elapsed"
              value={formatElapsed(selectedRun.startedAt, selectedRun.endedAt)}
              width={metricWidth}
              stacked={mode === 'stacked'}
            />
          </Box>
          <Box marginTop={1}>
            <WorkflowStepper
              stages={selectedFeature?.workflow?.stages ?? DEFAULT_STEPPER_STAGES}
              workflowStages={workflowStages}
              currentStage={selectedRun.pipelineCurrentStage ?? selectedRun.stage}
              width={innerWidth}
            />
          </Box>
          {activeTab ? (
            <TabBar
              theme={theme}
              sections={DETAIL_SECTION_ORDER}
              activeTab={activeTab}
              labels={DETAIL_SECTION_LABEL}
              width={innerWidth}
            />
          ) : null}
          <Box marginTop={1} flexDirection="column">
            {visibleDetailSections.map((sectionId) => (
              <Box key={sectionId} marginTop={1} flexDirection="column">
                {renderDetailSection(sectionId, {
                  theme,
                  selectedRun,
                  selectedFeature,
                  backlogSettings,
                  selectedRunStage: _selectedRunStage,
                  breakdown,
                  sessionTokens,
                  pipelineTokens,
                  workflowStages,
                  declaredTasks,
                  visibleOutput,
                  outputPaused,
                  logsVisible,
                  width: innerWidth,
                  dense: detailDense,
                })}
              </Box>
            ))}
            <Text {...theme.role('muted')}>
              {activeTab
                ? `Tab ${String(DETAIL_SECTION_ORDER.indexOf(activeTab) + 1)}/${String(DETAIL_SECTION_ORDER.length)} · Tab/Shift+Tab cycle · 1-7 jump · i density: ${detailDense ? 'dense' : 'rich'}`
                : `Section ${String(detailSectionIndex + 1)}-${String(Math.min(DETAIL_SECTION_ORDER.length, detailSectionIndex + detailPageSize))} of ${String(DETAIL_SECTION_ORDER.length)}  ·  j/k scroll · PgUp/PgDn page · i density: ${detailDense ? 'dense' : 'rich'}`}
            </Text>
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {runs.length > 0 && (
            <Text {...theme.role('muted')}>
              Select a run with arrows or j/k, then press Enter to inspect it. Esc returns here.
            </Text>
          )}
          <Box flexDirection={mode === 'stacked' ? 'column' : 'row'}>
            {DASHBOARD_GROUP_ORDER.map((groupId) => {
              const columnFocused = focusPanel === 'columns' && activeColumn === groupId;

              if (groupId === 'todo') {
                const visiblePending = pendingFeatures.slice(0, maxPerColumn);
                return (
                  <KanbanColumn
                    key={groupId}
                    label={DASHBOARD_GROUP_LABEL.todo}
                    count={pendingFeatures.length}
                    focused={columnFocused}
                    width={columnWidth}
                    stacked={mode === 'stacked'}
                    emptyLabel={COLUMN_EMPTY_LABEL.todo}
                    overflowCount={Math.max(0, pendingFeatures.length - maxPerColumn)}
                  >
                    {visiblePending.map((feature, index) => (
                      <KanbanCard
                        key={feature.id}
                        width={columnWidth}
                        selected={columnFocused && index === selectedPendingIndex}
                        focused={columnFocused}
                        pendingFeature={feature}
                      />
                    ))}
                  </KanbanColumn>
                );
              }

              const groupRuns = runs.filter((run) => getRunGroup(run.status) === groupId);
              const visibleRuns = groupRuns.slice(0, maxPerColumn);
              return (
                <KanbanColumn
                  key={groupId}
                  label={DASHBOARD_GROUP_LABEL[groupId]}
                  count={groupRuns.length}
                  focused={columnFocused}
                  width={columnWidth}
                  stacked={mode === 'stacked'}
                  emptyLabel={COLUMN_EMPTY_LABEL[groupId]}
                  overflowCount={Math.max(0, groupRuns.length - maxPerColumn)}
                >
                  {visibleRuns.map((run) => {
                    const isSelected = selectedRun?.runId === run.runId;
                    return (
                      <KanbanCard
                        key={run.runId}
                        width={columnWidth}
                        selected={isSelected}
                        focused={columnFocused}
                        run={run}
                        feature={featureCatalog[run.featureId] ?? null}
                      >
                        {groupId === 'execution' && isSelected && run.status === 'running' && workflowStages.length > 0 && (
                          <Box flexDirection="column" marginLeft={2}>
                            <Text {...theme.role('muted')}>{run.featureId} {'>'}</Text>
                            {workflowStages.map((stage) => (
                              <Text key={stage.stage} {...theme.role(getWorkflowRole(stage))}>
                                {'  |_ '}{stage.stage} {stageStatusLabel(stage)}
                              </Text>
                            ))}
                          </Box>
                        )}
                      </KanbanCard>
                    );
                  })}
                </KanbanColumn>
              );
            })}
          </Box>
          {nextDemands.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text {...theme.role('text')} bold>Next demands</Text>
              {nextDemands.slice(0, mode === 'stacked' ? 3 : 5).map((entry, index) => (
                <Text key={`${String(index)}:${entry}`} {...theme.role('muted')}>{truncateText(entry, Math.max(24, innerWidth - 2))}</Text>
              ))}
            </Box>
          )}
          {notifications.length > 0 && verticalBudget !== 'short' && (
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
  stacked,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  value: string;
  width: number;
  accentRole?: ThemeRoleName;
  stacked?: boolean;
}): React.ReactElement {
  const accentStyle = accentRole ? theme.role(accentRole) : theme.role('text');
  const innerWidth = Math.max(8, width - 4);
  return (
    <Box
      borderStyle="round"
      borderColor={accentStyle.color ?? theme.surface.borderColor}
      flexDirection="column"
      paddingX={1}
      width={width}
      marginRight={stacked ? 0 : 1}
      marginBottom={1}
    >
      <Text {...theme.role('muted')}>{truncateText(label, innerWidth)}</Text>
      <Text {...accentStyle}>{truncateText(value, innerWidth)}</Text>
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

function TabBar({
  theme,
  sections,
  activeTab,
  labels,
  width,
}: {
  theme: ReturnType<typeof useTheme>;
  sections: DetailSectionId[];
  activeTab: DetailSectionId;
  labels: Record<DetailSectionId, string>;
  width: number;
}): React.ReactElement {
  const parts = sections.map((id, index) => {
    const isActive = id === activeTab;
    const text = isActive ? `[${labels[id]}]` : labels[id];
    return { id, text, isActive, index };
  });

  return (
    <Box flexDirection="row" width={width} marginTop={1}>
      {parts.map((part, index) => (
        <React.Fragment key={part.id}>
          <Text {...(part.isActive ? theme.role('focus') : theme.role('muted'))} bold={part.isActive}>
            {part.text}
          </Text>
          {index < parts.length - 1 ? <Text {...theme.role('muted')}>{'  '}</Text> : null}
        </React.Fragment>
      ))}
    </Box>
  );
}

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

  return (
    <Text key={entry.id} {...getOutputStyle(theme, entry.source)}>
      {truncateText(entry.line, maxWidth)}
    </Text>
  );
}

interface DetailSectionContext {
  theme: ReturnType<typeof useTheme>;
  selectedRun: RunSummary;
  selectedFeature: FeatureCatalogEntry | null;
  backlogSettings: BacklogSettings;
  selectedRunStage: string | null;
  breakdown: RunBreakdown | null | undefined;
  sessionTokens: number | null;
  pipelineTokens: number | null;
  workflowStages: WorkflowStageSummary[];
  declaredTasks: NonNullable<FeatureCatalogEntry['tasks']>;
  visibleOutput: RunOutputRow[];
  outputPaused: boolean;
  logsVisible: boolean;
  width: number;
  dense: boolean;
}

function renderDetailSection(sectionId: DetailSectionId, ctx: DetailSectionContext): React.ReactElement {
  const {
    theme,
    selectedRun,
    selectedFeature,
    backlogSettings,
    selectedRunStage: _selectedRunStage,
    breakdown,
    sessionTokens,
    pipelineTokens,
    workflowStages,
    declaredTasks,
    visibleOutput,
    outputPaused,
    logsVisible,
    width,
    dense,
  } = ctx;

  switch (sectionId) {
    case 'summary': {
      const statusGlyph = STATUS_ICON[selectedRun.status];
      const elapsed = formatElapsed(selectedRun.startedAt, selectedRun.endedAt);
      const ctxLabel = selectedRun.contextWindowTokens
        ? `${formatPercent(selectedRun.contextWindowPercent)} ctx`
        : '— ctx';
      const head: string = [
        `${statusGlyph} ${selectedRun.status}`,
        `tool ${selectedRun.tool}`,
        `${formatTokens(sessionTokens)} session`,
        `${formatTokens(pipelineTokens)} pipeline`,
        `${elapsed} elapsed`,
        ctxLabel,
      ].join(' | ');
      return (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.summary} width={width}>
          <Text {...theme.role('text')}>{truncateText(head, Math.max(24, width - 4))}</Text>
          {selectedRun.pendingStageRequestPrompt && (
            <Text {...theme.role('muted')}>
              wait {truncateText(selectedRun.pendingStageRequestPrompt, Math.max(22, width - 6))}
            </Text>
          )}
          {breakdown?.wallMs != null && (
            <>
              <Text {...theme.role('muted')}>agent {formatDurationMs(breakdown.agentMs)}</Text>
              {breakdown.gateWaitMs > 0 && <Text {...theme.role('muted')}>gate wait {formatDurationMs(breakdown.gateWaitMs)}</Text>}
              {breakdown.retryCount > 0 && (
                <Text {...theme.role('muted')}>retry wait {formatDurationMs(breakdown.retryWaitMs)} ({String(breakdown.retryCount)}x)</Text>
              )}
            </>
          )}
        </DetailSection>
      );
    }

    case 'spec':
      return (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.spec} width={width}>
          {selectedFeature?.description ? (
            selectedFeature.description
              .split('\n')
              .slice(0, dense ? 4 : 18)
              .map((line, index) => (
                <Text key={index} {...theme.role('muted')}>
                  {truncateText(line || ' ', Math.max(24, width - 4))}
                </Text>
              ))
          ) : (
            <Text {...theme.role('muted')}>
              No spec or specFile declared for {selectedRun.featureId} in the backlog.
            </Text>
          )}
        </DetailSection>
      );

    case 'workflow':
      return (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.workflow} width={width}>
          <Text {...theme.role('muted')}>
            {workflowStages.length > 0
              ? 'Workflow progress is shown in the header stepper above. Per-stage task breakdown:'
              : selectedRun.pipelineResumeSummary
                ? truncateText(selectedRun.pipelineResumeSummary, Math.max(24, width - 4))
                : 'No workflow steps recorded for this run yet.'}
          </Text>
          {workflowStages.length > 0 ? (
            workflowStages.map((stage) => (
              <Box key={stage.stage} flexDirection="column" marginBottom={1}>
                <Text {...theme.role('muted')}>
                  {[
                    stage.totalTokens > 0 ? `${formatTokens(stage.totalTokens)} tokens` : null,
                    stage.maxContextPercent !== null ? `${formatPercent(stage.maxContextPercent)} ctx` : null,
                    stage.running > 0 ? `${String(stage.running)} active` : null,
                    stage.pending > 0 ? `${String(stage.pending)} pending` : null,
                    stage.blocked > 0 ? `${String(stage.blocked)} blocked` : null,
                    stage.failed > 0 ? `${String(stage.failed)} failed` : null,
                    stage.skipped > 0 ? `${String(stage.skipped)} skipped` : null,
                  ].filter(Boolean).join('  ·  ') || `${stage.stage}: completed`}
                </Text>
                {stage.tasks.slice(0, dense ? 1 : 6).map((task, index) => (
                  <Text key={`${stage.stage}:${task.taskId}:${String(index)}`} {...theme.role('muted')}>
                    {task.status === 'running' ? '>' : '-'} {truncateText(
                      [
                        task.title,
                        task.totalTokens ? `${formatTokens(task.totalTokens)} tokens` : null,
                        task.contextWindowPercent !== null && task.contextWindowPercent !== undefined
                          ? `${formatPercent(task.contextWindowPercent)} ctx`
                          : null,
                      ].filter(Boolean).join('  ·  '),
                      Math.max(20, width - 6),
                    )}
                  </Text>
                ))}
              </Box>
            ))
          ) : null}
        </DetailSection>
      );

    case 'config':
      return selectedFeature ? (
        <FeatureConfigSection feature={selectedFeature} settings={backlogSettings} width={width} />
      ) : (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.config} width={width}>
          <Text {...theme.role('muted')}>No feature catalog entry found for {selectedRun.featureId}.</Text>
        </DetailSection>
      );

    case 'skills':
      return (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.skills} width={width}>
          {selectedFeature?.skills.length ? (
            selectedFeature.skills.map((skill, index) => (
              <Text key={`${skill}:${String(index)}`} {...theme.role('success')}>
                - {skill}
              </Text>
            ))
          ) : (
            <Text {...theme.role('muted')}>No backlog skill metadata found for this run.</Text>
          )}
        </DetailSection>
      );

    case 'tasks':
      return (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.tasks} width={width}>
          {declaredTasks.length > 0 ? (
            declaredTasks.slice(0, dense ? 5 : 14).map((task) => (
              <Text key={task.id} {...theme.role('muted')}>
                {BACKLOG_TASK_ICON[task.status] ?? '○'} {task.id} — {truncateText(task.title, Math.max(20, width - 12))}
              </Text>
            ))
          ) : (
            <Text {...theme.role('muted')}>No task breakdown declared for {selectedRun.featureId} in the backlog.</Text>
          )}
        </DetailSection>
      );

    case 'output':
      return (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.output} width={width}>
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
                  (dense ? visibleOutput.slice(-6) : visibleOutput).map((entry) => renderOutputEntry(theme, entry, Math.max(28, width - 6)))
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
      );

    default:
      return <Text {...theme.role('muted')}>Unknown section.</Text>;
  }
}

function collectNextDemands(runs: RunSummary[]): string[] {
  const seen = new Set<string>();
  const next = runs
    .map((run) => {
      const summary = run.pipelineResumeSummary?.trim();
      if (!summary?.includes('next ')) return null;
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
