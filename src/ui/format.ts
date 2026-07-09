import type { RunSummary } from '../db/repo.js';
import type { RunStatusTone } from './theme/types.js';

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
  if (secs < 60) return `${String(secs)}s`;
  const mins = Math.floor(secs / 60);
  return `${String(mins)}m${String(secs % 60)}s`;
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
  return Number.isInteger(rounded) ? `${String(rounded)}%` : `${rounded.toFixed(1)}%`;
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

// D5 / US6: heartbeat lines carry a verbose diagnostic payload from
// core/adapters/spawn.ts (`[msq] <label> running for Ns (stdout XB stderr YB
// idle Zs) <suffix>`). FR-010 requires hiding the diagnostic metrics (stdout
// byte counts, stderr byte counts, elapsed seconds and idle seconds) for
// normal heartbeats, surfacing ONLY the agent's activity message suffix.
// Error heartbeats (anything that does NOT match the diagnostic pattern) are
// rendered as the raw line truncated to the available width, preserving the
// signal that something went wrong — diagnostics are hidden only when the
// recognized "running for Ns (stdout … idle Zs)" shape is present, which is
// the runaway-diagnostic-nose case the spec explicitly calls out.
const HEARTBEAT_PATTERN = /^\[msq\]\s+(.+?)\s+running for\s+(\d+)s\s+\(stdout\s+\d+B\s+stderr\s+\d+B\s+idle\s+(\d+)s\)\s*(.*)$/;

export function formatHeartbeatLine(line: string, maxWidth: number): string {
  const match = HEARTBEAT_PATTERN.exec(line.trim());
  if (!match) return truncateText(line, maxWidth);
  const suffix = (match[4] ?? '').trim();
  return truncateText(suffix || 'thinking...', maxWidth);
}

export function getLayoutMode(width: number): LayoutMode {
  if (width < 80) return 'stacked';
  if (width < 120) return 'compact';
  return 'full';
}

// F31 item 1: getLayoutMode only decides by WIDTH. H10 was a HEIGHT overflow
// (detail screen taller than common terminal windows). getVerticalBudget adds
// the second axis so callers can degrade the dashboard chrome (activity feed,
// stats density, cards-per-column) before content overflows vertically,
// without ever cutting the gates strip or the detail stepper/header.
export type VerticalBudget = 'short' | 'regular' | 'tall';

export function getVerticalBudget(height: number): VerticalBudget {
  if (height < 24) return 'short';
  if (height <= 40) return 'regular';
  return 'tall';
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
