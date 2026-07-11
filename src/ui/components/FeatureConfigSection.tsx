import React from 'react';
import { Box, Text } from 'ink';
import type { Retry, Workflow } from '../../core/backlog/schema.js';
import type { BacklogSettings, FeatureCatalogEntry } from '../catalog.js';
import { truncateText } from '../format.js';
import { useTheme } from '../theme/context.js';
import { getSurfaceBorderStyle } from '../theme/styles.js';

const DEFAULT_RETRY: Required<Retry> = {
  maxAttempts: 1,
  backoffMs: 5000,
  onFail: 'stop',
};

// Matches WorkflowSchema's own defaults (schema.ts) — used defensively when a
// catalog entry lacks a resolved workflow (e.g. a partial/stale lookup),
// consistent with this component's own "never blank, show the default" rule.
const _DEFAULT_WORKFLOW: Workflow = {
  mode: 'staged',
  stages: ['specify', 'plan', 'tasks', 'implement', 'validate'],
  approvals: { channel: 'telegram', autoAdvance: false },
  syncTasksToBacklog: true,
};

interface Props {
  feature: FeatureCatalogEntry;
  settings: BacklogSettings;
  width: number;
}

function row(theme: ReturnType<typeof useTheme>, label: string, value: string, muted = false): React.ReactElement {
  return (
    <Text key={label} {...(muted ? theme.role('muted') : theme.role('text'))}>
      {label}: {value}
    </Text>
  );
}

/**
 * F31 section 5b: consolidates EVERY config the feature runs with, shared by
 * the TODO preview (read-only, before starting) and the run detail's
 * scrollable body — one source of truth instead of two divergent renders.
 * Fields not explicitly set in the backlog show the resolved default (never
 * blank), per the section's "campos nao definidos exibem o default resolvido".
 */
export function FeatureConfigSection({ feature, settings, width }: Props): React.ReactElement {
  const theme = useTheme();
  const retry = feature.retry;
  const retryExplicit = Boolean(retry);
  const resolvedRetry = { ...DEFAULT_RETRY, ...retry };
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- workflow/dependsOn set by Zod defaults
  const workflow = feature.workflow ?? _DEFAULT_WORKFLOW;
  const skills = feature.skills;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const dependsOn = feature.dependsOn ?? [];
  const stageSkillEntries = Object.entries(settings.stageSkills);
  const innerWidth = Math.max(24, width - 4);

  return (
    <Box
      borderStyle="round"
      {...getSurfaceBorderStyle(theme, { role: 'muted' })}
      paddingX={1}
      flexDirection="column"
      width={width}
    >
      <Text {...theme.role('text')} bold>Feature Config</Text>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Execution</Text>
        {row(theme, 'tool', feature.tool)}
        {row(theme, 'model', feature.model ?? `${feature.tool} (default)`, !feature.model)}
        {row(theme, 'effort', feature.effort)}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Workflow</Text>
        {row(theme, 'mode', workflow.mode)}
        {row(theme, 'stages', workflow.stages.join(' → '))}
        {row(theme, 'syncTasksToBacklog', String(workflow.syncTasksToBacklog))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Approvals</Text>
        {row(theme, 'channel', workflow.approvals.channel)}
        {row(theme, 'autoAdvance', String(workflow.approvals.autoAdvance))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Skills</Text>
        {skills.length > 0 ? (
          skills.map((skill) => (
            <Text key={skill} {...theme.role('success')}>- {skill}</Text>
          ))
        ) : (
          <Text {...theme.role('muted')}>No skills declared in feature.</Text>
        )}
        {stageSkillEntries.length > 0 && (
          <>
            <Text {...theme.role('muted')}>stageSkills (defaults):</Text>
            {stageSkillEntries.map(([stage, skills]) => (
              <Text key={stage} {...theme.role('muted')}>
                {'  '}{stage}: {truncateText(skills.join(', '), Math.max(16, innerWidth - stage.length - 4))}
              </Text>
            ))}
          </>
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Dependencies</Text>
        <Text {...theme.role('muted')}>
          {dependsOn.length > 0 ? dependsOn.join(', ') : 'none'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Retry</Text>
        {row(theme, 'maxAttempts', String(resolvedRetry.maxAttempts), !retryExplicit)}
        {row(theme, 'backoffMs', String(resolvedRetry.backoffMs), !retryExplicit)}
        {row(theme, 'onFail', resolvedRetry.onFail, !retryExplicit)}
      </Box>
      {settings.budget && (
        <Box marginTop={1} flexDirection="column">
          <Text {...theme.role('muted')} bold>Budget (backlog)</Text>
          {settings.budget.maxTokens !== undefined && row(theme, 'maxTokens', String(settings.budget.maxTokens))}
          {settings.budget.perFeatureMaxTokens !== undefined
            && row(theme, 'perFeatureMaxTokens', String(settings.budget.perFeatureMaxTokens))}
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Files</Text>
        {row(theme, 'specFile', feature.specFile ?? 'not declared', !feature.specFile)}
        {row(theme, 'context', feature.context && feature.context.length > 0 ? feature.context.join(', ') : 'none', !feature.context?.length)}
      </Box>
    </Box>
  );
}
