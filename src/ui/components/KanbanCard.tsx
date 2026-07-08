import React from 'react';
import { Box, Text } from 'ink';
import type { RunSummary } from '../../db/repo.js';
import type { FeatureCatalogEntry } from '../catalog.js';
import { STATUS_ICON, getRunStageLabel, getRunStatusTone, truncateText } from '../format.js';
import { useTheme } from '../theme/context.js';

interface Props {
  width: number;
  selected: boolean;
  focused: boolean;
  /** Set for EXECUTION/DONE/FALHA columns — an actual run. */
  run?: RunSummary | null;
  /** Set for the TODO column — a feature that has never run. */
  pendingFeature?: FeatureCatalogEntry | null;
  /** Catalog entry for `run`'s feature, used to resolve model/effort. */
  feature?: FeatureCatalogEntry | null;
  /** EXECUTION column only: inline workflow stage tree under the selected running row. */
  children?: React.ReactNode;
}

// F31 section 3: cards used to show only the tool (`codex`/`claude`). Every
// column now shows the full tripla so a user can tell at a glance which
// model/effort a run (or a not-yet-started feature) is configured with.
function toolModelEffort(tool: string, model: string | undefined, effort: string): string {
  return `${tool} · ${model ?? tool} · ${effort}`;
}

/**
 * F31 "componente de card unico": the one row renderer shared by every
 * kanban column (EXECUTION/BLOCKED, TODO, DONE, FALHA), absorbing what used
 * to be RunTable rows plus the inline EXECUTION-only row markup. `run` and
 * `pendingFeature` are mutually exclusive — TODO cards have no run yet.
 */
export function KanbanCard({ width, selected, focused, run, pendingFeature, feature, children }: Props): React.ReactElement {
  const theme = useTheme();
  const labelStyle = selected && focused ? theme.role('focus') : theme.role('text');
  const prefix = selected ? '>' : ' ';

  if (pendingFeature) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text {...labelStyle} bold={selected}>
          {prefix} {truncateText(`${pendingFeature.id}  ${pendingFeature.title}`, Math.max(18, width - 2))}
        </Text>
        <Text {...theme.role('muted')}>
          {'  '}{toolModelEffort(pendingFeature.tool, pendingFeature.model, pendingFeature.effort)}
        </Text>
      </Box>
    );
  }

  if (!run) {
    return <Text {...theme.role('muted')}>—</Text>;
  }

  const statusStyle = theme.statusTone(getRunStatusTone(run.status));
  const stageLabel = getRunStageLabel(run);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text {...labelStyle} bold={selected}>
        {prefix} {STATUS_ICON[run.status]} {truncateText(run.featureId, Math.max(14, width - 4))}
      </Text>
      <Text {...statusStyle}>
        {'  '}{toolModelEffort(run.tool, feature?.model, feature?.effort ?? '—')}{stageLabel ? `  ·  ${stageLabel}` : ''}
      </Text>
      {children}
    </Box>
  );
}
