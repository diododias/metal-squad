import type { RunSummary } from '../../../db/repo.js';

export function formatElapsed(startedAt: string, endedAt: string | null): string {
  const start = parseTimestampMs(startedAt);
  if (start === null) return '—';
  const end = endedAt ? parseTimestampMs(endedAt) : Date.now();
  const secs = Math.max(0, Math.floor(((end ?? Date.now()) - start) / 1000));
  if (secs < 60) return `${String(secs)}s`;
  const mins = Math.floor(secs / 60);
  return `${String(mins)}m${String(secs % 60)}s`;
}

export function formatClockTime(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const ms = parseTimestampMs(iso);
  if (ms === null) return undefined;
  return new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${String(secs)}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${String(mins)}m${String(secs % 60)}s`;
  const hours = Math.floor(mins / 60);
  return `${String(hours)}h${String(mins % 60)}m`;
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

export function getPublishStatusLabel(run: RunSummary): string {
  if (run.publishVerified) return 'verified';
  if (run.prUrl || run.prNumber) return 'unverified';
  if (run.publishError) return 'missing evidence';
  return '—';
}

export function formatPublishTarget(run: RunSummary): string {
  if (run.prNumber) return `PR #${String(run.prNumber)}`;
  if (run.branchName) return run.branchName;
  return '—';
}

export function formatTokens(total: number | null | undefined): string {
  if (total === null || total === undefined) return '—';
  if (total >= 1000) return `${String(Number((total / 1000).toFixed(1)))}k`;
  return String(total);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${String(rounded)}%` : `${rounded.toFixed(1)}%`;
}

export function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3)}...`;
}

const HEARTBEAT_PATTERN =
  /^\[msq\]\s+(.+?)\s+running for\s+(\d+)s\s+\(stdout\s+\d+B\s+stderr\s+\d+B\s+idle\s+(\d+)s\)\s*(.*)$/;

export function formatHeartbeatLine(line: string, maxWidth: number): string {
  const match = HEARTBEAT_PATTERN.exec(line.trim());
  if (!match) return truncateText(line, maxWidth);
  const suffix = (match[4] ?? '').trim();
  return truncateText(suffix || 'thinking...', maxWidth);
}

export function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
