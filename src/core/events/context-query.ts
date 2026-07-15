import type { ContextQueryEvent, RunOutputEvent } from './types.js';

const SHELL_READ_PREFIXES = [
  'cat',
  'sed',
  'head',
  'tail',
  'less',
  'more',
  'ls',
  'find',
  'rg',
  'grep',
  'git show',
  'git diff',
  'git status',
  'wc',
  'nl',
];

export function deriveContextQueryEvent(event: RunOutputEvent): ContextQueryEvent | null {
  const line = event.line.trim();
  if (!line || event.source === 'heartbeat') return null;

  const queryTool = detectQueryTool(line);
  if (!queryTool) return null;

  return {
    runId: event.runId,
    featureId: event.featureId,
    tool: event.tool,
    queryTool,
    kind: queryTool === 'shell' ? 'shell_read' : 'structured',
    target: extractTarget(line, queryTool),
    observedBytes: Buffer.byteLength(line, 'utf8'),
    latencyMs: extractLatencyMs(line),
    cacheHit: extractCacheHit(line),
    rawLine: line,
  };
}

function detectQueryTool(line: string): 'dora' | 'serena' | 'shell' | null {
  const normalized = line.toLowerCase();
  if (normalized.startsWith('shell ')) {
    return isShellReadCommand(extractShellCommand(line)) ? 'shell' : null;
  }
  if (/\btool (mcp__)?dora([._:]|__|\b)/i.test(line)) return 'dora';
  if (/\btool (mcp__)?serena([._:]|__|\b)/i.test(line)) return 'serena';

  if (/^tool\s+(bash|exec_command|functions\.exec_command|shell)\b/i.test(line)) {
    return isShellReadCommand(extractShellCommand(line)) ? 'shell' : null;
  }

  return null;
}

function extractShellCommand(line: string): string {
  if (line.toLowerCase().startsWith('shell ')) {
    return line
      .slice('shell '.length)
      .split(' -> ')[0]
      ?.replace(/\(exit \d+\)\s*$/, '')
      .trim() ?? '';
  }

  const commandMatch = /"(?:command|cmd)"\s*:\s*"([^"]+)"/.exec(line);
  if (commandMatch?.[1]) return commandMatch[1].trim();
  return '';
}

function isShellReadCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (!normalized) return false;
  return SHELL_READ_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `));
}

function extractTarget(line: string, queryTool: 'dora' | 'serena' | 'shell'): string | null {
  if (queryTool === 'shell') {
    const command = extractShellCommand(line);
    return command || null;
  }

  const toolPrefix = /^tool\s+\S+\s*/i;
  const payload = line.replace(toolPrefix, '').trim();
  return payload || line;
}

function extractLatencyMs(line: string): number | null {
  const patterns = [
    /"latencyMs"\s*:\s*(\d+)/i,
    /"latency_ms"\s*:\s*(\d+)/i,
    /\blatency(?:_ms|Ms)?[=:\s]+(\d+)/i,
    /\belapsed(?:_ms|Ms)?[=:\s]+(\d+)/i,
    /\bduration(?:_ms|Ms)?[=:\s]+(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function extractCacheHit(line: string): boolean | null {
  if (/"cacheHit"\s*:\s*true/i.test(line) || /"cache_hit"\s*:\s*true/i.test(line) || /\bcache hit\b/i.test(line)) {
    return true;
  }
  if (/"cacheHit"\s*:\s*false/i.test(line) || /"cache_hit"\s*:\s*false/i.test(line) || /\bcache miss\b/i.test(line)) {
    return false;
  }
  return null;
}
