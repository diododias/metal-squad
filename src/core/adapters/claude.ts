import type { ToolAdapter, RunResult, TokenUsage } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { runCli } from './spawn.js';
import { buildSpecKitPrompt } from '../backlog/prompt.js';

// Sem flag nativa de "effort": mapeia para o tier de modelo.
const EFFORT_MODEL: Record<Effort, string> = {
  low: 'haiku',
  medium: 'sonnet',
  high: 'opus',
};

interface ClaudeJson {
  result?: string;
  subtype?: string;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export const claudeAdapter: ToolAdapter = {
  tool: 'claude',

  effortFlag(effort: Effort): string[] {
    return ['--model', EFFORT_MODEL[effort]];
  },

  async runFeature(feature: Feature, cwd: string): Promise<RunResult> {
    const model = feature.model ? ['--model', feature.model] : this.effortFlag(feature.effort);
    const args = [
      '-p', buildSpecKitPrompt(feature),
      '--output-format', 'json',
      '--dangerously-skip-permissions',
      ...model,
    ];

    const { code, stdout, stderr } = await runCli('claude', args, { cwd });
    if (code !== 0) return { ok: false, summary: stderr.slice(-500) || `exit ${code}` };

    const json = safeJson<ClaudeJson>(stdout);
    return {
      ok: json?.subtype !== 'error_max_turns' && code === 0,
      summary: (json?.result ?? '').slice(0, 200),
      usage: this.parseUsage?.(stdout) ?? undefined,
    };
  },

  parseUsage(transcript: string): TokenUsage | null {
    const json = safeJson<ClaudeJson>(transcript);
    if (!json?.usage) return null;
    const input = json.usage.input_tokens ?? 0;
    const output = json.usage.output_tokens ?? 0;
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
