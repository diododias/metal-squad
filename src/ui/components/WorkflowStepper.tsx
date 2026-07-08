import React from 'react';
import { Box, Text } from 'ink';
import type { WorkflowStageSummary } from '../workflow.js';
import { useTheme } from '../theme/context.js';

interface Props {
  stages: string[];
  workflowStages: WorkflowStageSummary[];
  currentStage: string | null;
  width: number;
}

type StageMarker = 'done' | 'current' | 'next';

function markerFor(
  stage: string,
  currentStage: string | null,
  summary: WorkflowStageSummary | undefined,
): StageMarker {
  if (stage === currentStage) return 'current';
  if (summary && summary.total > 0 && summary.done === summary.total) return 'done';
  if (!currentStage) return summary && summary.total > 0 && summary.done === summary.total ? 'done' : 'next';
  return 'next';
}

const MARKER_ICON: Record<StageMarker, string> = {
  done: '✓',
  current: '▸',
  next: '·',
};

/**
 * F31 section 5: a compact, always-visible horizontal stepper — ALL stages
 * in order, marked done (✓) / current (▸, highlighted) / next (·, muted) —
 * anchored at the top of the detail screen so the user sees where they are
 * without expanding anything. Reads workflow.stages (item 4's fonte unica de
 * ordem) + summarizeTaskRuns + pipelineCurrentStage; no output parsing.
 */
export function WorkflowStepper({ stages, workflowStages, currentStage, width }: Props): React.ReactElement {
  const theme = useTheme();
  const summaryByStage = new Map(workflowStages.map((summary) => [summary.stage, summary]));

  return (
    <Box width={width}>
      {stages.map((stage, index) => {
        const summary = summaryByStage.get(stage);
        const marker = markerFor(stage, currentStage, summary);
        const countLabel = summary && summary.total > 0 ? ` ${summary.done}/${summary.total}` : '';
        const style = marker === 'current'
          ? theme.role('focus')
          : marker === 'done'
            ? theme.role('success')
            : theme.role('muted');

        return (
          <Text key={stage} {...style} bold={marker === 'current'}>
            {MARKER_ICON[marker]} {stage}{countLabel}{index < stages.length - 1 ? '  →  ' : ''}
          </Text>
        );
      })}
    </Box>
  );
}
