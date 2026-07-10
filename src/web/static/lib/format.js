export const STATUS_ICON = {
  running: '⟳',
  done: '✓',
  failed: '✗',
  blocked: '⊘',
  aborted: '■',
};

export function formatElapsed(startedAt, endedAt) {
  const start = parseTimestampMs(startedAt);
  if (start === null) return '—';
  const end = endedAt ? parseTimestampMs(endedAt) : Date.now();
  const secs = Math.max(0, Math.floor(((end ?? Date.now()) - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m${secs % 60}s`;
}

export function formatDurationMs(ms) {
  if (ms === null || ms === undefined) return '—';
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h${mins % 60}m`;
}

export function getRunStatusLabel(run) {
  if (run.pendingStageRequestKind === 'approval') return 'awaiting approval';
  if (run.pendingStageRequestKind === 'input') return 'awaiting input';
  if (run.pipelineStatus === 'running' && run.rawStatus === 'done') return 'advancing';
  return run.status;
}

export function getRunStageLabel(run) {
  const stage = run.pipelineCurrentStage ?? run.stage;
  if (!stage) return null;
  if (run.pendingStageRequestKind === 'approval') return `${stage} -> approval`;
  if (run.pendingStageRequestKind === 'input') return `${stage} -> input`;
  if (run.pipelineStatus === 'running' && run.rawStatus === 'running') return `${stage} active`;
  if (run.pipelineStatus === 'done' && run.rawStatus === 'done') return `${stage} complete`;
  return stage;
}

export function formatTokens(total) {
  if (total === null || total === undefined) return '—';
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

export function formatPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function truncateText(value, max) {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, max);
  return `${value.slice(0, max - 3)}...`;
}

const HEARTBEAT_PATTERN = /^\[msq\]\s+(.+?)\s+running for\s+(\d+)s\s+\(stdout\s+\d+B\s+stderr\s+\d+B\s+idle\s+(\d+)s\)\s*(.*)$/;

export function formatHeartbeatLine(line, maxWidth) {
  const match = HEARTBEAT_PATTERN.exec(line.trim());
  if (!match) return truncateText(line, maxWidth);
  const suffix = (match[4] ?? '').trim();
  return truncateText(suffix || 'thinking...', maxWidth);
}

function parseTimestampMs(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
