import type { Command } from 'commander';
import { listRunEvents, listRunsForStats, type StatsFilters } from '../db/repo.js';
import {
  computeRunBreakdown,
  computeStats,
  formatBreakdown,
  formatDurationMs,
  formatTokensCompact,
} from '../core/stats.js';

interface StatsCliOptions {
  period?: string;
  repo?: string;
  tool?: string;
  format?: string;
  run?: string;
}

export function registerStats(program: Command): void {
  program
    .command('stats')
    .description('Aggregated analytics for runs (tokens, cost, duration, success rate)')
    .option('--period <period>', 'time window, e.g. 7d, 24h, 30d')
    .option('--repo <repoId>', 'filter by repo id')
    .option('--tool <tool>', 'filter by tool (claude, codex, opencode)')
    .option('--run <runId>', 'show the time breakdown for a single run')
    .option('--format <format>', 'output format: text | json', 'text')
    .action((opts: StatsCliOptions) => {
      if (opts.run) {
        printRunBreakdown(Number(opts.run), opts.format === 'json');
        return;
      }

      const filters: StatsFilters = {
        ...(opts.period ? { sinceDays: parsePeriodDays(opts.period) } : {}),
        ...(opts.repo ? { repoId: opts.repo } : {}),
        ...(opts.tool ? { tool: opts.tool } : {}),
      };
      const rows = listRunsForStats(filters);
      const stats = computeStats(rows);

      if (opts.format === 'json') {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      const scope = [
        opts.repo ?? 'all repos',
        opts.period ? `last ${opts.period}` : 'all time',
        opts.tool ? `tool ${opts.tool}` : null,
      ].filter(Boolean).join(' — ');

      const { runs, tokens } = stats;
      const lines = [
        scope,
        `  Runs: ${runs.total} total (${runs.done} done, ${runs.failed} failed, ${runs.running} running, ${runs.blocked} blocked, ${runs.aborted} aborted)`,
        `  Tokens: ${formatTokensCompact(tokens.total)} (${formatTokensCompact(tokens.input)} input, ${formatTokensCompact(tokens.output)} output${tokens.cachedInput > 0 ? `, ${formatTokensCompact(tokens.cachedInput)} cached` : ''})`,
        `  Context: avg ${formatContextPercent(stats.context.avgPercent)}${stats.context.maxPercent !== null ? `, max ${formatContextPercent(stats.context.maxPercent)}` : ''}`,
        `  Cost: ~$${stats.costUsd.toFixed(2)}`,
        `  Avg duration: ${formatDurationMs(stats.avgDurationMs)}`,
        `  Success rate: ${stats.successRatePercent !== null ? `${stats.successRatePercent}%` : '—'}`,
      ];

      if (stats.topFeaturesByCost.length > 0) {
        lines.push('', '  Top features by cost:');
        for (const feature of stats.topFeaturesByCost) {
          lines.push(`    ${feature.featureId}  $${feature.costUsd.toFixed(2)}  (${feature.runs} run${feature.runs === 1 ? '' : 's'})`);
        }
      }

      console.log(lines.join('\n'));
    });
}

function printRunBreakdown(runId: number, asJson: boolean): void {
  if (!Number.isInteger(runId)) {
    throw new Error('Invalid --run value: expected a numeric run id.');
  }
  const run = listRunsForStats().find((row) => row.id === runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }
  const breakdown = computeRunBreakdown(listRunEvents(runId), run.startedAt, run.endedAt);
  if (asJson) {
    console.log(JSON.stringify({
      runId,
      featureId: run.featureId,
      totalTokens: run.totalTokens,
      contextWindowTokens: run.contextWindowTokens ?? null,
      contextWindowPercent: run.contextWindowPercent ?? null,
      ...breakdown,
    }, null, 2));
    return;
  }
  const header = [
    `${run.featureId}`,
    run.totalTokens !== null ? `${formatTokensCompact(run.totalTokens)} tokens` : null,
    run.contextWindowPercent !== null && run.contextWindowPercent !== undefined
      ? `${formatContextPercent(run.contextWindowPercent)} of context`
      : null,
  ].filter(Boolean).join(' — ');
  console.log(`${header} — ${formatBreakdown(breakdown) || 'no timeline recorded'}`);
}

export function parsePeriodDays(period: string): number {
  const match = /^(\d+)([dhw])$/.exec(period.trim());
  if (!match) {
    throw new Error(`Invalid --period value: ${period}. Use formats like 24h, 7d, 2w.`);
  }
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === 'h') return value / 24;
  if (unit === 'w') return value * 7;
  return value;
}

function formatContextPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}
