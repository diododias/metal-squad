import React from 'react';
import { Box, Text } from 'ink';
import { formatTokens } from '../format.js';
import { useTheme } from '../theme/context.js';
import type { TokenStatsState } from '../hooks/useTokenStats.js';

interface Props {
  done: number;
  todo: number;
  execution: number;
  falha: number;
  gatesPending: number;
  tokenStats: TokenStatsState;
  /** F31 item 1: 'short' drops the tokens segment to keep this one dense line. */
  compact?: boolean;
}

/**
 * F31 section 1: always-visible overview stats, promoted out of the
 * overview-only body (old MainPanel overviewSummary) so done/todo/execution/
 * falha/gates/tokens read at a glance without opening the Cost Dashboard.
 * Tokens are the current period (7d), not all-time (item 7) — all-time and
 * per-repo/feature breakdown stay in the Cost Dashboard (`d`).
 */
export function StatsBar({ done, todo, execution, falha, gatesPending, tokenStats, compact = false }: Props): React.ReactElement {
  const theme = useTheme();
  const tokensLabel = tokenStats.status === 'loading' ? '—' : formatTokens(tokenStats.totalTokens);

  return (
    <Box>
      <Text {...theme.statusTone('done')}>{done} done</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.role('text')}>{todo} todo</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.statusTone('running')}>{execution} execução</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.statusTone('failed')}>{falha} falha</Text>
      <Text {...theme.role('muted')}> | </Text>
      <Text {...theme.role('warning')}>{gatesPending} aprovações</Text>
      {!compact && (
        <>
          <Text {...theme.role('muted')}> | tokens (7d) {tokensLabel}</Text>
          {tokenStats.status === 'error' ? <Text {...theme.role('error')}> (stats unavailable)</Text> : null}
        </>
      )}
    </Box>
  );
}
