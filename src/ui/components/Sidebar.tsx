import React from 'react';
import { Box, Text } from 'ink';
import type { GateRow, RunSummary } from '../../db/repo.js';
import type { LayoutMode } from '../format.js';
import { STATUS_COLOR, STATUS_ICON, truncateText } from '../format.js';

export type FocusPanel = 'runs' | 'gates' | 'main';

interface Props {
  runs: RunSummary[];
  gates: GateRow[];
  selectedRunIndex: number;
  selectedGateIndex: number;
  focusPanel: FocusPanel;
  skills: string[];
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
  selectedRunIndex,
  selectedGateIndex,
  focusPanel,
  skills,
  width,
  mode,
}: Props): React.ReactElement {
  const runLimit = mode === 'full' ? 8 : 5;
  const gateLimit = mode === 'full' ? 5 : 3;
  const skillLimit = Math.max(1, Math.min(6, mode === 'stacked' ? 4 : 5));
  const labelWidth = Math.max(12, width - 8);

  const runsContent = runs.length === 0 ? (
    <Text dimColor>Idle. Start a run to populate the board.</Text>
  ) : (
    <>
      {runs.slice(0, runLimit).map((run, index) => {
        const selected = index === selectedRunIndex;
        const color = STATUS_COLOR[run.status];
        return (
          <Box key={run.runId}>
            <Text color={selected ? 'cyan' : undefined} bold={selected}>
              {selected ? '>' : ' '} {STATUS_ICON[run.status]} {truncateText(run.featureId, labelWidth)}
            </Text>
            {mode === 'full' && (
              <Text dimColor>
                {' '}[{run.tool}]
              </Text>
            )}
            {mode !== 'stacked' && <Text color={color}> {run.status}</Text>}
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
          <Text key={gate.id} color={selected ? 'yellow' : undefined} bold={selected}>
            {selected ? '>' : ' '} {truncateText(gate.featureId, labelWidth)}
          </Text>
        );
      })}
    </>
  );

  const skillsContent = skills.length === 0 ? (
    <Text dimColor>Select a run to inspect declared skills.</Text>
  ) : (
    <>
      {skills.slice(0, skillLimit).map((skill) => (
        <Text key={skill} color="green">
          - {truncateText(skill, labelWidth)}
        </Text>
      ))}
      {skills.length > skillLimit && <Text dimColor>+{skills.length - skillLimit} more</Text>}
    </>
  );

  return (
    <Box flexDirection="column" width={width}>
      {sectionBox('Runs', focusPanel === 'runs', runsContent)}
      {sectionBox('Gates', focusPanel === 'gates', gatesContent)}
      {sectionBox('Skills', focusPanel === 'main', skillsContent)}
    </Box>
  );
}
