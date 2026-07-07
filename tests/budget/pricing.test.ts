import { describe, it, expect } from 'vitest';
import { resolvePricing, estimateCost, estimateUsageCost, PRICING } from '../../src/core/budget/pricing.js';

describe('resolvePricing', () => {
  it('returns exact match for claude', () => {
    const p = resolvePricing('claude');
    expect(p).toBe(PRICING.claude);
  });

  it('is case-insensitive', () => {
    expect(resolvePricing('CLAUDE')).toBe(PRICING.claude);
    expect(resolvePricing('Claude')).toBe(PRICING.claude);
  });

  it('returns exact match for codex', () => {
    expect(resolvePricing('codex')).toBe(PRICING.codex);
  });

  it('returns exact match for opencode', () => {
    expect(resolvePricing('opencode')).toBe(PRICING.opencode);
  });

  it('returns exact match for gpt-5', () => {
    expect(resolvePricing('gpt-5')).toBe(PRICING['gpt-5']);
  });

  it('returns exact match for gpt-5-mini', () => {
    expect(resolvePricing('gpt-5-mini')).toBe(PRICING['gpt-5-mini']);
  });

  it('returns exact match for claude-opus', () => {
    expect(resolvePricing('claude-opus')).toBe(PRICING['claude-opus']);
  });

  it('returns exact match for claude-sonnet', () => {
    expect(resolvePricing('claude-sonnet')).toBe(PRICING['claude-sonnet']);
  });

  it('returns exact match for claude-haiku', () => {
    expect(resolvePricing('claude-haiku')).toBe(PRICING['claude-haiku']);
  });

  it('matches gpt-5.3-codex by substring (has priority over gpt-5-codex)', () => {
    const p = resolvePricing('openai/gpt-5.3-codex');
    expect(p).toBe(PRICING['gpt-5.3-codex']);
  });

  it('matches gpt-5-codex by substring', () => {
    const p = resolvePricing('openai/gpt-5-codex-latest');
    expect(p).toBe(PRICING['gpt-5-codex']);
  });

  it('matches gpt-5.4 by substring', () => {
    const p = resolvePricing('gpt-5.4-2024');
    expect(p).toBe(PRICING['gpt-5.4']);
  });

  it('matches gpt-5.4-mini by substring (priority over gpt-5.4)', () => {
    const p = resolvePricing('gpt-5.4-mini-preview');
    expect(p).toBe(PRICING['gpt-5.4-mini']);
  });

  it('matches gpt-5.4-nano by substring', () => {
    const p = resolvePricing('gpt-5.4-nano-2025');
    expect(p).toBe(PRICING['gpt-5.4-nano']);
  });

  it('matches gpt-5-mini by substring', () => {
    const p = resolvePricing('openai/gpt-5-mini');
    expect(p).toBe(PRICING['gpt-5-mini']);
  });

  it('matches claude-opus by substring', () => {
    const p = resolvePricing('anthropic/claude-opus-4-5');
    expect(p).toBe(PRICING['claude-opus']);
  });

  it('matches claude-sonnet by substring', () => {
    const p = resolvePricing('anthropic/claude-sonnet-4-5');
    expect(p).toBe(PRICING['claude-sonnet']);
  });

  it('matches claude-haiku by substring', () => {
    const p = resolvePricing('anthropic/claude-haiku-3');
    expect(p).toBe(PRICING['claude-haiku']);
  });

  it('falls back to claude pricing for unknown claude model', () => {
    const p = resolvePricing('anthropic/claude-unknown-model');
    expect(p).toBe(PRICING.claude);
  });

  it('falls back to codex pricing for unknown codex model', () => {
    const p = resolvePricing('some-codex-variant');
    expect(p).toBe(PRICING.codex);
  });

  it('falls back to opencode pricing for unknown opencode model', () => {
    const p = resolvePricing('myopencode-variant');
    expect(p).toBe(PRICING.opencode);
  });

  it('returns default {input:3, output:15} for completely unknown model', () => {
    const p = resolvePricing('totally-unknown-model');
    expect(p).toEqual({ input: 3, output: 15 });
  });
});

describe('estimateCost', () => {
  it('returns null when all inputs are null', () => {
    expect(estimateCost(null, null, null, 'claude')).toBeNull();
  });

  it('returns 0 when all tokens are 0', () => {
    expect(estimateCost(0, 0, 0, 'claude')).toBe(0);
  });

  it('calculates cost with input tokens only', () => {
    // claude: input=$3/1M, output=$15/1M
    const cost = estimateCost(1_000_000, null, 0, 'claude');
    expect(cost).toBeCloseTo(3, 5);
  });

  it('calculates cost with output tokens only', () => {
    const cost = estimateCost(0, null, 1_000_000, 'claude');
    expect(cost).toBeCloseTo(15, 5);
  });

  it('calculates combined cost', () => {
    const cost = estimateCost(1_000_000, null, 1_000_000, 'claude');
    expect(cost).toBeCloseTo(18, 5);
  });

  it('uses cachedInput price when cachedInput price is set and tokens provided', () => {
    // codex: input=$1.25/1M, cachedInput=$0.125/1M
    const cost = estimateCost(0, 1_000_000, 0, 'codex');
    expect(cost).toBeCloseTo(0.125, 5);
  });

  it('falls back to input price for cached when no cachedInput pricing', () => {
    // claude has no cachedInput pricing; fallback to input=$3
    const cost = estimateCost(0, 1_000_000, 0, 'claude');
    expect(cost).toBeCloseTo(3, 5);
  });

  it('treats null token values as 0', () => {
    const cost = estimateCost(1_000_000, null, null, 'claude');
    expect(cost).toBeCloseTo(3, 5); // only input tokens
  });

  it('returns non-null when only one of the tokens is non-null', () => {
    expect(estimateCost(100, null, null, 'claude')).not.toBeNull();
    expect(estimateCost(null, 100, null, 'claude')).not.toBeNull();
    expect(estimateCost(null, null, 100, 'claude')).not.toBeNull();
  });
});

describe('estimateUsageCost', () => {
  it('calculates cost from TokenUsage object', () => {
    const usage = { input: 1_000_000, output: 1_000_000, total: 2_000_000 };
    const cost = estimateUsageCost(usage, 'claude');
    expect(cost).toBeCloseTo(18, 5);
  });

  it('returns 0 when all tokens are 0', () => {
    expect(estimateUsageCost({ input: 0, output: 0, total: 0 }, 'claude')).toBe(0);
  });

  it('uses cachedInput from usage when provided', () => {
    const usage = { input: 0, cachedInput: 1_000_000, output: 0, total: 1_000_000 };
    const cost = estimateUsageCost(usage, 'codex');
    expect(cost).toBeCloseTo(0.125, 5);
  });

  it('returns a number (never null)', () => {
    const result = estimateUsageCost({ input: 0, output: 0, total: 0 }, 'claude');
    expect(typeof result).toBe('number');
  });
});
