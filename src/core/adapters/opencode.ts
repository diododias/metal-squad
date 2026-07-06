import type { ToolAdapter, RunResult, RunFeatureOptions, TokenUsage } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { runCli } from './spawn.js';
import { msqEventBus } from '../events/index.js';

// OpenCode não expõe reasoning-effort direto (depende do provider/modelo).
// Convenção: modelo no formato "provider/model" (ex: anthropic/claude-sonnet-4-5).
const EFFORT_HINT: Record<Effort, string> = {
  low: 'small_model',
  medium: 'model',
  high: 'model',
};

export const opencodeAdapter: ToolAdapter = {
  tool: 'opencode',

  effortFlag(_effort: Effort): string[] {
    // efeito via seleção de modelo, não via flag
    return [];
  },

  async runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult> {
    const args = [
      'run',
      prompt,
      '--format', 'json',
      ...(feature.model ? ['--model', feature.model] : []),
    ];

    const { code, stdout, stderr } = await runCli('opencode', args, {
      cwd: opts.cwd,
      onStdoutLine: (line) => {
        const text = normalizeSnippet(line);
        if (!text) return;
        emitRunOutput(opts.runId, feature, text, 'stdout', 'stdout');
      },
      onStderrLine: (line) => {
        const text = normalizeSnippet(line);
        if (!text) return;
        emitRunOutput(opts.runId, feature, text, 'stderr', 'stderr');
      },
    });
    if (code !== 0) return { ok: false, summary: stderr.slice(-500) || `exit ${code}` };

    const json = safeJson<{ response?: string }>(stdout);
    const usage = this.parseUsage?.(stdout) ?? undefined;
    if (usage) emitUsage(opts.runId, feature, usage);
    return {
      ok: true,
      summary: (json?.response ?? stdout).slice(0, 200),
      usage,
    };
  },

  // TODO: `opencode run --format json` nem sempre traz usage;
  // alternativa: parsear `opencode export <session>` ou `opencode stats`.
  parseUsage(transcript: string): TokenUsage | null {
    const json = safeJson<any>(transcript);
    const u = json?.usage ?? json?.tokens;
    if (!u) return null;
    const input = u.input ?? u.input_tokens ?? 0;
    const output = u.output ?? u.output_tokens ?? 0;
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

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function emitRunOutput(
  runId: number,
  feature: Feature,
  line: string,
  stream: 'stdout' | 'stderr',
  source: 'stdout' | 'stderr',
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
