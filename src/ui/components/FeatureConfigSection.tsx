import React from 'react';
import { Box, Text } from 'ink';
import type { Retry } from '../../core/backlog/schema.js';
import type { BacklogSettings, FeatureCatalogEntry } from '../catalog.js';
import { truncateText } from '../format.js';
import { useTheme } from '../theme/context.js';
import { getSurfaceBorderStyle } from '../theme/styles.js';

const DEFAULT_RETRY: Required<Retry> = {
  maxAttempts: 1,
  backoffMs: 5000,
  onFail: 'stop',
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
        <Text {...theme.role('muted')} bold>Execução</Text>
        {row(theme, 'tool', feature.tool)}
        {row(theme, 'model', feature.model ?? `${feature.tool} (default)`, !feature.model)}
        {row(theme, 'effort', feature.effort)}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Workflow</Text>
        {row(theme, 'mode', feature.workflow.mode)}
        {row(theme, 'stages', feature.workflow.stages.join(' → '))}
        {row(theme, 'syncTasksToBacklog', String(feature.workflow.syncTasksToBacklog))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Aprovações</Text>
        {row(theme, 'channel', feature.workflow.approvals.channel)}
        {row(theme, 'autoAdvance', String(feature.workflow.approvals.autoAdvance))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Skills</Text>
        {feature.skills.length > 0 ? (
          feature.skills.map((skill) => (
            <Text key={skill} {...theme.role('success')}>- {skill}</Text>
          ))
        ) : (
          <Text {...theme.role('muted')}>Nenhuma skill declarada na feature.</Text>
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
        <Text {...theme.role('muted')} bold>Dependências</Text>
        <Text {...theme.role('muted')}>
          {feature.dependsOn.length > 0 ? feature.dependsOn.join(', ') : 'nenhuma'}
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
          {settings.budget.maxCostUsd !== undefined && row(theme, 'maxCostUsd', `$${settings.budget.maxCostUsd}`)}
          {settings.budget.perFeatureMaxTokens !== undefined
            && row(theme, 'perFeatureMaxTokens', String(settings.budget.perFeatureMaxTokens))}
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text {...theme.role('muted')} bold>Arquivos</Text>
        {row(theme, 'specFile', feature.specFile ?? 'não declarado', !feature.specFile)}
        {row(theme, 'context', feature.context && feature.context.length > 0 ? feature.context.join(', ') : 'nenhum', !feature.context?.length)}
      </Box>
    </Box>
  );
}
