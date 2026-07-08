import React from 'react';
import { Box, Text } from 'ink';
import type { RunningTaskSummary, RunOutputRow, RunSummary, TaskRun } from '../../db/repo.js';
import type { PendingApproval } from '../hooks/useGates.js';
import type { NotificationEntry } from '../hooks/useNotifications.js';
import type { BacklogSettings, FeatureCatalogEntry } from '../catalog.js';
import type { LayoutMode, VerticalBudget } from '../format.js';
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

// Matches WorkflowSchema's own default (schema.ts) — used only when a run
// has no matching feature catalog entry to read workflow.stages from.
const DEFAULT_STEPPER_STAGES = ['specify', 'plan', 'tasks', 'implement', 'validate'];

interface Props {
  runs: RunSummary[];
  gates: PendingApproval[];
  selectedRun: RunSummary | null;
  selectedRunIndex: number;
  selectedFeature: FeatureCatalogEntry | null;
  /** F31 section 3: resolves model/effort per-row for every kanban card, not just the selected run. */
  featureCatalog?: Record<string, FeatureCatalogEntry>;
  /** F31 section 5b: backlog-level budget/stageSkills shown in the config section. */
  backlogSettings?: BacklogSettings;
  activeView: ActiveView;
  output: RunOutputRow[];
  outputPaused: boolean;
  logsVisible: boolean;
  focusPanel: 'columns' | 'gates' | 'activity';
  /** F31 "novo modelo de foco": which kanban column has the cursor. */
  activeColumn: DashboardGroupId;
  /** F31 section 5: first visible section in the run-detail scrollable body. */
  detailSectionIndex?: number;
  /** F31 section 5: how many sections fit per page (taller terminal → more). */
  detailPageSize?: number;
  /** F31 section 5: `i` toggle — collapses long sections when true. */
  detailDense?: boolean;
  /** F31 "Riscos de UX resolvidos" item 1: degrades the overview's own
   * chrome (cards-per-column, activity feed) under height pressure — never
   * cuts the gates strip. Distinct from detailPageSize's own budget use. */
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

const COLUMN_EMPTY_LABEL: Record<DashboardGroupId, string> = {
  execution: 'nenhuma em execução',
  todo: 'backlog vazio',
  done: 'nenhuma concluída',
  canceled: 'sem falhas',
};

export function MainPanel({
  runs,
  gates,
  selectedRun,
  selectedRunIndex,
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
  verticalBudget = 'regular',
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
  // F31 item 1 degradation order: activity feed goes first, then stats
  // density (StatsBar's own concern), then cards-per-column (here) — gates
  // never cut. Taller terminals raise the cap; short ones lower it.
  const maxPerColumn = verticalBudget === 'short'
    ? (mode === 'stacked' ? 2 : 3)
    : verticalBudget === 'tall'
      ? (mode === 'stacked' ? 6 : 10)
      : (mode === 'stacked' ? 3 : 5);
  const columnGap = mode === 'stacked' ? 0 : 1;
  const columnWidth = mode === 'stacked'
    ? innerWidth
    : Math.max(18, Math.floor((innerWidth - columnGap * (DASHBOARD_GROUP_ORDER.length - 1)) / DASHBOARD_GROUP_ORDER.length));
  const nextDemands = collectNextDemands(runs);
  const selectedRunStage = selectedRun ? getRunStageLabel(selectedRun) : null;
  const selectedRunStatusLabel = selectedRun ? getRunStatusLabel(selectedRun) : null;
  // F31 item 4: pass the feature's declared stages so the stepper and this
  // summary can never disagree on order, even when a feature customizes them.
  const workflowStages = summarizeTaskRuns(taskRuns, selectedFeature?.workflow?.stages);
  const visibleDetailSections = DETAIL_SECTION_ORDER.slice(detailSectionIndex, detailSectionIndex + detailPageSize);
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
              : 'Overview'}
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
          {/* F31 section 5: anchored header — title, metrics, and the
              workflow stepper never scroll away; only the body below does. */}
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
          <Box marginTop={1}>
            <WorkflowStepper
              stages={selectedFeature?.workflow?.stages ?? DEFAULT_STEPPER_STAGES}
              workflowStages={workflowStages}
              currentStage={selectedRun.pipelineCurrentStage ?? selectedRun.stage}
              width={innerWidth}
            />
          </Box>
          {/* F31 section 5: scrollable body — Ink has no native scroll, so
              this pages through DETAIL_SECTION_ORDER (F31 "section-level
              paging"): j/k move one section, PgUp/PgDn move a full page.
              `i` toggles density (shorter previews), never hides a section
              outright — nothing here is permanently cut. */}
          <Box marginTop={1} flexDirection="column">
            {visibleDetailSections.map((sectionId) => (
              <Box key={sectionId} marginTop={1} flexDirection="column">
                {renderDetailSection(sectionId, {
                  theme,
                  selectedRun,
                  selectedFeature,
                  backlogSettings,
                  selectedRunStage,
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
              {`Section ${detailSectionIndex + 1}-${Math.min(DETAIL_SECTION_ORDER.length, detailSectionIndex + detailPageSize)} of ${DETAIL_SECTION_ORDER.length}`}
              {'  ·  j/k scroll · PgUp/PgDn page · i density: '}{detailDense ? 'dense' : 'rich'}
            </Text>
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
          {/* F31 section 3 + "componente de card unico": columns render
              side-by-side in full/compact layout, stacked in narrow
              terminals — every group always renders (EmptyState instead of
              being skipped), and every card is the same KanbanCard whether
              it's a pending feature (TODO) or an actual run. */}
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
                <Text key={`${index}:${entry}`} {...theme.role('muted')}>{truncateText(entry, Math.max(24, innerWidth - 2))}</Text>
              ))}
            </Box>
          )}
          {/* F31 item 1: first to go under height pressure — still reachable
              via `o` (full notifications view), never truly lost. */}
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

// F31 section 5: one of DETAIL_SECTION_ORDER's sections, rendered as its own
// rich bordered Box (unchanged styling from before) — only the surrounding
// paging logic in MainPanel decides which of these are currently visible.
// `dense` (the `i` toggle) shortens previews without ever removing a section.
function renderDetailSection(sectionId: DetailSectionId, ctx: DetailSectionContext): React.ReactElement {
  const {
    theme,
    selectedRun,
    selectedFeature,
    backlogSettings,
    selectedRunStage,
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
    case 'summary':
      return (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.summary} width={width}>
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
              wait {truncateText(selectedRun.pendingStageRequestPrompt, Math.max(22, width - 6))}
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
      );

    case 'spec':
      return (
        <DetailSection theme={theme} title={DETAIL_SECTION_LABEL.spec} width={width}>
          {selectedFeature?.description ? (
            selectedFeature.description
              .split('\n')
              .slice(0, dense ? 4 : 18)
              .map((line, index) => (
                // eslint-disable-next-line react/no-array-index-key
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
                {stage.tasks.slice(0, dense ? 1 : 6).map((task, index) => (
                  <Text key={`${stage.stage}:${task.taskId}:${index}`} {...theme.role('muted')}>
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
          ) : (
            <Text {...theme.role('muted')}>
              {selectedRun.pipelineResumeSummary
                ? truncateText(selectedRun.pipelineResumeSummary, Math.max(24, width - 4))
                : 'No workflow steps recorded for this run yet.'}
            </Text>
          )}
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
