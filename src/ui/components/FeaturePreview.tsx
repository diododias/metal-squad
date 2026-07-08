import React from 'react';
import { Box, Text } from 'ink';
import type { BacklogSettings, FeatureCatalogEntry } from '../catalog.js';
import { truncateText } from '../format.js';
import type { LayoutMode } from '../format.js';
import { useTheme } from '../theme/context.js';
import { getSurfaceBorderStyle } from '../theme/styles.js';
import { FeatureConfigSection } from './FeatureConfigSection.js';

const BACKLOG_TASK_ICON: Record<string, string> = {
  todo: '○',
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '!',
};

interface Props {
  feature: FeatureCatalogEntry;
  settings: BacklogSettings;
  mode: LayoutMode;
  width: number;
}

/**
 * F31 section 4: read-only preview opened by `Enter` on a TODO card — spec,
 * declared tasks, and the full feature config, WITHOUT starting the run.
 * `Enter` inside confirms/starts (wired by the caller), `Esc` returns without
 * starting. No live output or stepper here: the feature has never run yet.
 */
export function FeaturePreview({ feature, settings, mode, width }: Props): React.ReactElement {
  const theme = useTheme();
  const columnWidth = mode === 'stacked' ? width : Math.max(30, Math.floor((width - 2) / 2));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text {...theme.role('text')} bold>{feature.title}</Text>
      <Text {...theme.role('muted')}>{feature.id} — not started yet</Text>
      <Box marginTop={1} flexDirection={mode === 'stacked' ? 'column' : 'row'}>
        <Box flexDirection="column" width={columnWidth} marginRight={mode === 'stacked' ? 0 : 2}>
          <Box
            borderStyle="round"
            {...getSurfaceBorderStyle(theme, { role: 'muted' })}
            paddingX={1}
            flexDirection="column"
            width={columnWidth}
          >
            <Text {...theme.role('text')} bold>Feature Spec</Text>
            <Box marginTop={1} flexDirection="column">
              {feature.description ? (
                feature.description
                  .split('\n')
                  .slice(0, mode === 'stacked' ? 10 : 18)
                  .map((line, index) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <Text key={index} {...theme.role('muted')}>
                      {truncateText(line || ' ', Math.max(24, columnWidth - 4))}
                    </Text>
                  ))
              ) : (
                <Text {...theme.role('muted')}>No spec or specFile declared for {feature.id} in the backlog.</Text>
              )}
            </Box>
          </Box>
          <Box marginTop={1} borderStyle="round" {...getSurfaceBorderStyle(theme, { role: 'muted' })} paddingX={1} flexDirection="column" width={columnWidth}>
            <Text {...theme.role('text')} bold>Tasks</Text>
            <Box marginTop={1} flexDirection="column">
              {(feature.tasks ?? []).length > 0 ? (
                (feature.tasks ?? []).slice(0, mode === 'stacked' ? 8 : 14).map((task) => (
                  <Text key={task.id} {...theme.role('muted')}>
                    {BACKLOG_TASK_ICON[task.status] ?? '○'} {task.id} — {truncateText(task.title, Math.max(20, columnWidth - 12))}
                  </Text>
                ))
              ) : (
                <Text {...theme.role('muted')}>No task breakdown declared for {feature.id} in the backlog.</Text>
              )}
            </Box>
          </Box>
        </Box>
        <Box flexDirection="column" width={columnWidth} marginTop={mode === 'stacked' ? 1 : 0}>
          <FeatureConfigSection feature={feature} settings={settings} width={columnWidth} />
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text {...theme.role('muted')}>Enter confirms and starts this feature · Esc goes back without starting</Text>
      </Box>
    </Box>
  );
}
