import React from 'react';
import { Box, Text } from 'ink';
import type { RunSummary, TaskRun } from '../../db/repo.js';
import type { LayoutMode } from '../format.js';
import { STATUS_COLOR, STATUS_ICON, getRunStageLabel, getRunStatusLabel, truncateText } from '../format.js';
import type { NotificationEntry } from '../hooks/useNotifications.js';
import type { PendingApproval } from '../hooks/useGates.js';
import { NotificationsFeed } from './NotificationsFeed.js';
import type { ActiveView } from './MainPanel.js';
import { summarizeTaskRuns } from '../workflow.js';

export type FocusPanel = 'runs' | 'gates' | 'main';

const TASK_STATUS_ICON: Record<TaskRun['status'], string> = {
  done: '✓',
  running: '⟳',
  failed: '✗',
  blocked: '!',
  pending: '○',
  skipped: '○',
};

interface Props {
  runs: RunSummary[];
  gates: PendingApproval[];
  notifications: NotificationEntry[];
  selectedRunIndex: number;
  selectedGateIndex: number;
  focusPanel: FocusPanel;
  activeView: ActiveView;
  skills: string[];
  taskRuns?: TaskRun[];
  width: number;
  mode: LayoutMode;
}

function sectionLabel(label: string, active: boolean): React.ReactElement {
  return (
    <Text color={active ? 'cyan' : 'white'} bold={active}>
      {active ? `> ${label}` : label}
    </Text>
  );
}

function sectionBox(
  title: string,
  active: boolean,
  content: React.ReactNode,
): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor={active ? 'cyan' : 'gray'} paddingX={1} paddingY={0} flexDirection="column" marginBottom={1}>
      {sectionLabel(title, active)}
      {content}
    </Box>
  );
}

export function Sidebar({
  runs,
  gates,
  notifications,
  selectedRunIndex,
  selectedGateIndex,
  focusPanel,
  activeView,
  skills,
  taskRuns = [],
  width,
  mode,
}: Props): React.ReactElement {
  const runLimit = mode === 'full' ? 7 : 5;
  const gateLimit = mode === 'full' ? 5 : 3;
  const skillLimit = Math.max(1, Math.min(6, mode === 'stacked' ? 4 : 4));
  const notifLimit = mode === 'full' ? 4 : 3;
  const labelWidth = Math.max(18, width - 8);
  const workflowStages = summarizeTaskRuns(taskRuns);

  const runsContent = runs.length === 0 ? (
    <Text dimColor>Idle. Start a run to populate the board.</Text>
  ) : (
    <>
      {runs.slice(0, runLimit).map((run, index) => {
        const selected = index === selectedRunIndex;
        const color = STATUS_COLOR[run.status];
        const stageLabel = getRunStageLabel(run);
        return (
          <Box key={run.runId} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={selected ? 'cyan' : undefined} bold={selected}>
                {selected ? '>' : ' '} {STATUS_ICON[run.status]} {truncateText(run.featureId, labelWidth - 4)}
              </Text>
            </Box>
            <Text dimColor>
              {truncateText(`${run.tool}  ·  ${getRunStatusLabel(run)}${stageLabel ? `  ·  ${stageLabel}` : ''}`, labelWidth)}
            </Text>
            {selected && (
              <Text color={color}>
                {truncateText(`opened in detail on the main panel`, labelWidth)}
              </Text>
            )}
          </Box>
        );
      })}
    </>
  );

  const gatesContent = gates.length === 0 ? (
    <Text dimColor>No pending gates.</Text>
  ) : (
    <>
      {gates.slice(0, gateLimit).map((gate, index) => {
        const selected = index === selectedGateIndex;
        return (
          <Box key={`${gate.kind}:${gate.id}`} flexDirection="column">
            <Text color={selected ? 'yellow' : undefined} bold={selected}>
              {selected ? '>' : ' '} {truncateText(gate.featureId, labelWidth)}
              {gate.kind === 'stage' ? ' [stage]' : ''}
            </Text>
            {selected && gate.prompt && (
              <Text dimColor>   {truncateText(gate.prompt, labelWidth)}</Text>
            )}
          </Box>
        );
      })}
      <Text dimColor>  [a]pprove [s]kip [r]etry</Text>
    </>
  );

  const workflowContent = workflowStages.length === 0 ? (
    skills.length === 0 ? (
      <Text dimColor>Select a run to inspect workflow or declared skills.</Text>
    ) : (
      <>
        {skills.slice(0, skillLimit).map((skill) => (
          <Text key={skill} color="green">
            - {truncateText(skill, labelWidth)}
          </Text>
        ))}
        {skills.length > skillLimit && <Text dimColor>+{skills.length - skillLimit} more</Text>}
      </>
    )
  ) : (
    <>
      {workflowStages.map((stage) => (
        <Box key={stage.stage} flexDirection="column" marginBottom={1}>
          <Text color={stage.running > 0 ? 'cyan' : stage.failed > 0 ? 'red' : stage.blocked > 0 ? 'yellow' : stage.done === stage.total ? 'green' : undefined}>
            {truncateText(`${stage.stage}  ${stage.done}/${stage.total} done`, labelWidth)}
          </Text>
          <Text dimColor>
            {truncateText(
              [
                stage.running > 0 ? `${stage.running} active` : null,
                stage.pending > 0 ? `${stage.pending} pending` : null,
                stage.failed > 0 ? `${stage.failed} failed` : null,
                stage.blocked > 0 ? `${stage.blocked} blocked` : null,
                stage.skipped > 0 ? `${stage.skipped} skipped` : null,
              ].filter(Boolean).join('  ·  ') || 'completed',
              labelWidth,
            )}
          </Text>
          {stage.tasks[0] && (
            <Text dimColor>
              {TASK_STATUS_ICON[stage.tasks[0].status]} {truncateText(stage.tasks[0].title, labelWidth - 2)}
            </Text>
          )}
        </Box>
      ))}
    </>
  );

  return (
    <Box flexDirection="column" width={width}>
      {sectionBox('Runs', focusPanel === 'runs', runsContent)}
      {sectionBox('Gates', focusPanel === 'gates', gatesContent)}
      {sectionBox('Workflow', focusPanel === 'main', workflowContent)}
      {sectionBox('Notifications', activeView === 'notifications', (
        <NotificationsFeed notifications={notifications} maxVisible={notifLimit} width={labelWidth} compact />
      ))}
    </Box>
  );
}
