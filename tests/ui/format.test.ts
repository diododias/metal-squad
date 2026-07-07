import { describe, expect, it } from 'vitest';
import { estimateCost, formatClock, formatElapsed, formatTokensIO } from '../../src/ui/format.js';

describe('ui format helpers', () => {
  it('treats sqlite timestamps as UTC and never shows negative elapsed time', () => {
    expect(formatElapsed('2026-07-07 00:49:25', '2026-07-07 01:02:30')).toBe('13m5s');
    expect(formatElapsed('2026-07-07 01:02:30', '2026-07-07 00:49:25')).toBe('0s');
    expect(formatClock('2026-07-07 01:02:30')).toBe('01:02');
  });

  it('includes cached tokens in the summary and prices codex with cached-input discounts', () => {
    expect(formatTokensIO(3_000, 12_000, 400)).toBe('3.0k in/12.0k cache/400out');
    expect(estimateCost(3_000, 12_000, 400, 'gpt-5-codex')).toBeCloseTo(0.00925, 4);
  });
});
