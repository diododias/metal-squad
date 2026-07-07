import { execFileSync } from 'node:child_process';
import type { ToolAdapter, RunResult, RunFeatureOptions, TokenUsage } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { CliTimeoutError, runCli } from './spawn.js';
import { msqEventBus } from '../events/index.js';
import { parseControlSignal } from './control.js';

// Sem flag nativa de "effort": mapeia para o tier de modelo.
const EFFORT_MODEL: Record<Effort, string> = {
  low: 'haiku',
  medium: 'sonnet',
  high: 'opus',
};

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; name: string; input: unknown };

interface StreamJsonEvent {
  type: string;
  subtype?: string;
  message?: { content?: ContentBlock[] };
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export const claudeAdapter: ToolAdapter = {
  tool: 'claude',

  effortFlag(effort: Effort): string[] {
    return ['--model', EFFORT_MODEL[effort]];
  },

  async runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult> {
    const model = feature.model ? ['--model', feature.model] : this.effortFlag(feature.effort);
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--dangerously-skip-permissions',
      ...model,
      '--',
      prompt,
    ];

    let code: number;
    let stdout: string;
    let stderr: string;
    const progress = createClaudeProgress();

    msqEventBus.emit('task:started', {
      runId: opts.runId,
      featureId: feature.id,
      taskId: feature.id,
      title: feature.id,
    });

    try {
      ({ code, stdout, stderr } = await runCli('claude', args, {
        cwd: opts.cwd,
        heartbeatMs: 30_000,
        logLabel: `claude ${feature.id}`,
        heartbeatSuffix: () => progress.heartbeatSuffix(),
        onHeartbeat: (message) => emitRunOutput(opts.runId, feature, message, 'stderr', 'heartbeat'),
        onStdoutLine: (line) => {
          const updates = progress.onStdoutLine(line);
          for (const update of updates) {
            if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stdout', update.output.source);
            if (update.usage) emitUsage(opts.runId, feature, update.usage);
            if (update.stage) emitTaskStage(opts.runId, feature, update.stage);
          }
        },
        onStderrLine: (line) => {
          const updates = progress.onStderrLine(line);
          for (const update of updates) {
            if (update.output) emitRunOutput(opts.runId, feature, update.output.line, 'stderr', update.output.source);
          }
        },
      }));
    } catch (error) {
      if (error instanceof CliTimeoutError) {
        const touchedFiles = detectTouchedFiles(opts.cwd);
        const partial = summarizePartialOutput(error.stdout, error.stderr, touchedFiles);
        const usage = this.parseUsage?.(error.stdout) ?? undefined;
        if (usage) emitUsage(opts.runId, feature, usage);
        return {
          ok: false,
          summary: `timeout após ${Math.round(error.runtimeMs / 1000)}s. ${partial}`,
          usage,
        };
      }
      throw error;
    }

    if (code !== 0) {
      const partial = summarizePartialOutput(stdout, stderr, detectTouchedFiles(opts.cwd));
      return { ok: false, summary: `exit ${code}. ${partial}` };
    }

    const resultEvent = findResultEvent(stdout);
    const usage = this.parseUsage?.(stdout) ?? undefined;
    if (usage) emitUsage(opts.runId, feature, usage);
    return {
      ok: resultEvent?.subtype !== 'error_max_turns' && code === 0,
      summary: (resultEvent?.result ?? '').slice(0, 200),
      usage,
      control: parseControlSignal(resultEvent?.result ?? ''),
    };
  },

  parseUsage(transcript: string): TokenUsage | null {
    const evt = findResultEvent(transcript);
    if (!evt?.usage) return null;
    const input = evt.usage.input_tokens ?? 0;
    const output = evt.usage.output_tokens ?? 0;
    return { input, output, total: input + output };
  },
};

function safeJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function findResultEvent(transcript: string): StreamJsonEvent | null {
  for (const line of transcript.split('\n')) {
    const evt = safeJson<StreamJsonEvent>(line);
    if (evt?.type === 'result') return evt;
  }
  return null;
}

function lastAgentMessage(transcript: string): string {
  return normalizeSnippet(findResultEvent(transcript)?.result ?? '');
}

function summarizePartialOutput(stdout: string, stderr: string, touchedFiles: string[]): string {
  const touchedSummary = formatTouchedFiles(touchedFiles);
  const finalMsg = lastAgentMessage(stdout);
  if (finalMsg) {
    return touchedSummary
      ? `última mensagem do agente: ${finalMsg}. ${touchedSummary}`
      : `última mensagem do agente: ${finalMsg}`;
  }

  const stderrTail = normalizeSnippet(stderr);
  if (stderrTail) {
    return touchedSummary ? `stderr final: ${stderrTail}. ${touchedSummary}` : `stderr final: ${stderrTail}`;
  }

  const stdoutTail = normalizeSnippet(stdout);
  if (stdoutTail) {
    return touchedSummary ? `stdout final: ${stdoutTail}. ${touchedSummary}` : `stdout final: ${stdoutTail}`;
  }

  if (touchedSummary) return touchedSummary;
  return 'sem saída útil capturada.';
}

function detectTouchedFiles(cwd: string): string[] {
  try {
    const output = execFileSync(
      'git',
      ['status', '--short', '--untracked-files=all'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output
      .split('\n')
      .map((line) => parseGitStatusPath(line))
      .filter((path): path is string => Boolean(path));
  } catch {
    return [];
  }
}

function parseGitStatusPath(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const statusPayload = line.slice(3).trim();
  if (!statusPayload) return trimmed;
  const renamed = statusPayload.split(' -> ');
  return renamed[renamed.length - 1] ?? statusPayload;
}

function formatTouchedFiles(files: string[]): string {
  if (files.length === 0) return '';
  const shown = files.slice(0, 5).join(', ');
  const remaining = files.length - Math.min(files.length, 5);
  return remaining > 0
    ? `arquivos tocados: ${shown} (+${remaining})`
    : `arquivos tocados: ${shown}`;
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

interface ProgressUpdate {
  output?: {
    line: string;
    source: 'agent' | 'tool' | 'stderr';
  };
  usage?: TokenUsage;
  stage?: string;
}

function createClaudeProgress(): {
  onStdoutLine: (line: string) => ProgressUpdate[];
  onStderrLine: (line: string) => ProgressUpdate[];
  heartbeatSuffix: () => string | undefined;
} {
  let eventCount = 0;
  let stderrCount = 0;
  let lastAgentSnippet = '';
  let lastToolSnippet = '';
  let lastStderrSnippet = '';

  return {
    onStdoutLine(line: string) {
      const updates = parseClaudeLine(line);
      for (const u of updates) {
        if (u.output) {
          eventCount += 1;
          if (u.output.source === 'tool') lastToolSnippet = u.output.line;
          else if (u.output.source === 'agent') lastAgentSnippet = u.output.line;
        }
      }
      return updates;
    },
    onStderrLine(line: string) {
      const text = normalizeSnippet(line);
      if (!text) return [];
      stderrCount += 1;
      lastStderrSnippet = text;
      return [{ output: { line: text, source: 'stderr' } }];
    },
    heartbeatSuffix() {
      const parts: string[] = [];
      if (eventCount > 0) parts.push(`eventos=${eventCount}`);
      if (stderrCount > 0) parts.push(`stderr=${stderrCount}`);
      if (lastAgentSnippet) parts.push(`agente="${lastAgentSnippet}"`);
      else if (lastToolSnippet) parts.push(`tool="${lastToolSnippet}"`);
      else if (lastStderrSnippet) parts.push(`stderr="${lastStderrSnippet}"`);
      return parts.length > 0 ? `[${parts.join(' | ')}]` : undefined;
    },
  };
}

function parseClaudeLine(line: string): ProgressUpdate[] {
  const evt = safeJson<StreamJsonEvent>(line);
  if (!evt?.type) return [];

  if (evt.type === 'result') {
    if (!evt.usage) return [];
    const input = evt.usage.input_tokens ?? 0;
    const output = evt.usage.output_tokens ?? 0;
    if (input === 0 && output === 0) return [];
    return [{ usage: { input, output, total: input + output } }];
  }

  if (evt.type === 'assistant' && evt.message?.content) {
    const updates: ProgressUpdate[] = [];
    for (const block of evt.message.content) {
      if (block.type === 'thinking') {
        const text = normalizeSnippet(block.thinking);
        if (text) updates.push({ output: { line: `[thinking] ${text}`, source: 'agent' } });
      } else if (block.type === 'text') {
        const text = normalizeSnippet(block.text);
        if (text) updates.push({ output: { line: text, source: 'agent' } });
      } else if (block.type === 'tool_use') {
        const name = normalizeSnippet(block.name);
        const input = normalizeSnippet(JSON.stringify(block.input ?? {}));
        const stage = detectStageFromSkill(name);
        const outputLine = normalizeSnippet(`tool ${name}${input && input !== '{}' ? ` ${input}` : ''}`);
        updates.push({
          output: { line: outputLine, source: 'tool' },
          ...(stage ? { stage } : {}),
        });
      }
    }
    return updates;
  }

  return [];
}

function emitRunOutput(
  runId: number,
  feature: Feature,
  line: string,
  stream: 'stdout' | 'stderr',
  source: 'agent' | 'tool' | 'stderr' | 'heartbeat',
): void {
  msqEventBus.emit('run:output', {
    runId,
    featureId: feature.id,
    tool: feature.tool,
    line,
    stream,
    source,
  });
}

function emitUsage(runId: number, feature: Feature, usage: TokenUsage): void {
  msqEventBus.emit('tokens:update', {
    runId,
    featureId: feature.id,
    tool: feature.tool,
    input: usage.input,
    output: usage.output,
    total: usage.total,
  });
}

const SKILL_STAGE_MAP: Record<string, string> = {
  'speckit-specify': 'specify',
  'speckit_specify': 'specify',
  'speckit-plan': 'plan',
  'speckit_plan': 'plan',
  'speckit-implement': 'implement',
  'speckit_implement': 'implement',
  'speckit-tasks': 'tasks',
  'speckit_tasks': 'tasks',
};

function detectStageFromSkill(skillName: string): string | null {
  const lower = skillName.toLowerCase();
  for (const [pattern, stage] of Object.entries(SKILL_STAGE_MAP)) {
    if (lower.includes(pattern)) return stage;
  }
  return null;
}

function emitTaskStage(runId: number, feature: Feature, stage: string): void {
  msqEventBus.emit('task:updated', {
    runId,
    featureId: feature.id,
    taskId: feature.id,
    status: 'running',
    stage,
  });
}
