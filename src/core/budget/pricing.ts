import type { TokenUsage } from '../adapters/types.js';

export interface ModelPricing {
  input: number;
  cachedInput?: number;
  output: number;
}

// Prices in USD per 1M tokens.
// Sources: OpenAI API pricing/model pages for GPT-5-Codex, GPT-5, GPT-5.4, and GPT-5.3-Codex.
export const PRICING: Record<string, ModelPricing> = {
  'claude': { input: 3, output: 15 },
  'claude-opus': { input: 15, output: 75 },
  'claude-sonnet': { input: 3, output: 15 },
  'claude-haiku': { input: 0.25, output: 1.25 },
  'codex': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-codex': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5.3-codex': { input: 1.75, cachedInput: 0.175, output: 14 },
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5.4': { input: 1.25, cachedInput: 0.125, output: 7.5 },
  'gpt-5.4-mini': { input: 0.375, cachedInput: 0.0375, output: 2.25 },
  'gpt-5.4-nano': { input: 0.10, cachedInput: 0.01, output: 0.625 },
  'opencode': { input: 3, output: 15 },
};

export function resolvePricing(modelOrTool: string): ModelPricing {
  const key = modelOrTool.toLowerCase();
  const exact = PRICING[key];
  if (exact) return exact;
  const entries = [
    'gpt-5.3-codex',
    'gpt-5-codex',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.4',
    'gpt-5-mini',
    'gpt-5',
    'claude-opus',
    'claude-sonnet',
    'claude-haiku',
  ] as const;
  for (const candidate of entries) {
    if (key.includes(candidate)) return PRICING[candidate]!;
  }
  if (key.includes('claude')) return PRICING.claude!;
  if (key.includes('codex')) return PRICING.codex!;
  if (key.includes('opencode')) return PRICING.opencode!;
  return { input: 3, output: 15 };
}

export function estimateCost(
  inputTokens: number | null,
  cachedInputTokens: number | null,
  outputTokens: number | null,
  modelOrTool: string,
): number | null {
  if (inputTokens === null && cachedInputTokens === null && outputTokens === null) return null;
  const pricing = resolvePricing(modelOrTool);
  const i = inputTokens ?? 0;
  const c = cachedInputTokens ?? 0;
  const o = outputTokens ?? 0;
  return (i * pricing.input + c * (pricing.cachedInput ?? pricing.input) + o * pricing.output) / 1_000_000;
}

export function estimateUsageCost(usage: TokenUsage, modelOrTool: string): number {
  return estimateCost(usage.input, usage.cachedInput ?? null, usage.output, modelOrTool) ?? 0;
}
