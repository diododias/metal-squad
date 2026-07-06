import type { ToolAdapter, RunResult, TokenUsage } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { runCli } from './spawn.js';

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

  async runFeature(feature: Feature, prompt: string, cwd: string): Promise<RunResult> {
    const args = [
      'run',
      prompt,
      '--format', 'json',
      ...(feature.model ? ['--model', feature.model] : []),
    ];

    const { code, stdout, stderr } = await runCli('opencode', args, { cwd });
    if (code !== 0) return { ok: false, summary: stderr.slice(-500) || `exit ${code}` };

    const json = safeJson<{ response?: string }>(stdout);
    return {
      ok: true,
      summary: (json?.response ?? stdout).slice(0, 200),
      usage: this.parseUsage?.(stdout) ?? undefined,
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
