import type { ToolAdapter, RunResult, TokenUsage } from './types.js';
import type { Effort, Feature } from '../backlog/schema.js';
import { runCli } from './spawn.js';
import { buildSpecKitPrompt } from '../backlog/prompt.js';

// Codex tem effort nativo via config: model_reasoning_effort.
const EFFORT: Record<Effort, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

export const codexAdapter: ToolAdapter = {
  tool: 'codex',

  effortFlag(effort: Effort): string[] {
    return ['-c', `model_reasoning_effort="${EFFORT[effort]}"`];
  },

  async runFeature(feature: Feature, cwd: string): Promise<RunResult> {
    const args = [
      'exec',
      buildSpecKitPrompt(feature),
      '--json',
      '--skip-git-repo-check',
      '--full-auto', // troque por --dangerously-bypass-approvals-and-sandbox se precisar 100% unattended
      ...(feature.model ? ['-m', feature.model] : []),
      ...this.effortFlag(feature.effort),
    ];

    const { code, stdout, stderr } = await runCli('codex', args, { cwd });
    if (code !== 0) return { ok: false, summary: stderr.slice(-500) || `exit ${code}` };

    const finalMsg = lastAgentMessage(stdout);
    return {
      ok: true,
      summary: finalMsg.slice(0, 200),
      usage: this.parseUsage?.(stdout) ?? undefined,
    };
  },

  // JSONL: o evento turn.completed carrega usage.
  parseUsage(transcript: string): TokenUsage | null {
    let usage: TokenUsage | null = null;
    for (const line of transcript.split('\n')) {
      const evt = safeJson<any>(line);
      if (evt?.type === 'turn.completed' && evt.usage) {
        const input = (evt.usage.input_tokens ?? 0) + (evt.usage.cached_input_tokens ?? 0);
        const output = (evt.usage.output_tokens ?? 0) + (evt.usage.reasoning_output_tokens ?? 0);
        usage = { input, output, total: input + output };
      }
    }
    return usage;
  },
};

function lastAgentMessage(transcript: string): string {
  let msg = '';
  for (const line of transcript.split('\n')) {
    const evt = safeJson<any>(line);
    if (evt?.type === 'item.completed' && evt.item?.type === 'agent_message') {
      msg = evt.item.text ?? msg;
    }
  }
  return msg;
}

function safeJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
