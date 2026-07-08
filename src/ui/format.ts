import type { RunSummary } from '../db/repo.js';
import type { RunStatusTone } from './theme/types.js';

export { PRICING, estimateCost } from '../core/budget/pricing.js';

export type LayoutMode = 'stacked' | 'compact' | 'full';
type RunStatus = RunSummary['status'];

export const STATUS_ICON: Record<RunStatus, string> = {
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '⊘',
  aborted: '■',
};

export const STATUS_TONE: Record<RunStatus, RunStatusTone> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
  blocked: 'blocked',
  aborted: 'aborted',
};

export function getRunStatusTone(status: RunStatus): RunStatusTone {
  return STATUS_TONE[status];
}

export function formatElapsed(startedAt: string, endedAt: string | null): string {
  const start = parseTimestampMs(startedAt);
  if (start === null) return '—';
  const end = endedAt ? parseTimestampMs(endedAt) : Date.now();
  const secs = Math.max(0, Math.floor(((end ?? Date.now()) - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m${secs % 60}s`;
}

export function getRunStatusLabel(run: RunSummary): string {
  if (run.pendingStageRequestKind === 'approval') return 'awaiting approval';
  if (run.pendingStageRequestKind === 'input') return 'awaiting input';
  if (run.pipelineStatus === 'running' && run.rawStatus === 'done') return 'advancing';
  return run.status;
}

export function getRunStageLabel(run: RunSummary): string | null {
  const stage = run.pipelineCurrentStage ?? run.stage;
  if (!stage) return null;
  if (run.pendingStageRequestKind === 'approval') return `${stage} -> approval`;
  if (run.pendingStageRequestKind === 'input') return `${stage} -> input`;
  if (run.pipelineStatus === 'running' && run.rawStatus === 'running') return `${stage} active`;
  if (run.pipelineStatus === 'done' && run.rawStatus === 'done') return `${stage} complete`;
  return stage;
}

export function formatTokens(total: number | null): string {
  if (total === null) return '—';
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function formatClock(iso: string | null): string {
  if (!iso) return '--:--';
  const ms = parseTimestampMs(iso);
  if (ms === null) return '--:--';
  return new Date(ms).toISOString().slice(11, 16);
}

export function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3)}...`;
}

// D5: heartbeat lines carry a verbose diagnostic payload from
// core/adapters/spawn.ts (`[msq] <label> running for Ns (stdout XB stderr YB
// idle Zs) <suffix>`). Rendered raw and then hard-truncated by width, this
// read as garbled noise (e.g. "...[msq] codex feat-10 running for 42s
// (stdout 1..." cut mid-token). This condenses it into one clean, bounded
// line instead of dumping+truncating the raw diagnostic string.
const HEARTBEAT_PATTERN = /^\[msq\]\s+(.+?)\s+running for\s+(\d+)s\s+\(stdout\s+\d+B\s+stderr\s+\d+B\s+idle\s+(\d+)s\)\s*(.*)$/;

export function formatHeartbeatLine(line: string, maxWidth: number): string {
  const match = HEARTBEAT_PATTERN.exec(line.trim());
  if (!match) return truncateText(line, maxWidth);
  const [, label, elapsed, idle, suffix] = match;
  const summary = `thinking... ${label} running ${elapsed}s (idle ${idle}s)${suffix ? ` — ${suffix}` : ''}`;
  return truncateText(summary, maxWidth);
}

export function getLayoutMode(width: number): LayoutMode {
  if (width < 80) return 'stacked';
  if (width < 120) return 'compact';
  return 'full';
}

export function formatCost(cost: number | null): string {
  if (cost === null) return '—';
  if (cost < 0.001) return '<$0.001';
  return `~$${cost.toFixed(3)}`;
}

export function formatTokensIO(
  input: number | null,
  cachedInput: number | null,
  output: number | null,
): string {
  if (input === null && cachedInput === null && output === null) return '—';
  const parts = [
    `${input !== null ? formatTokens(input) : '?'} in`,
  ];
  if ((cachedInput ?? 0) > 0) {
    parts.push(`${formatTokens(cachedInput ?? 0)} cache`);
  }
  parts.push(`${output !== null ? formatTokens(output) : '?'}out`);
  return parts.join('/');
}

function parseTimestampMs(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
