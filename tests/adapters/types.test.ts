import { describe, expect, it } from 'vitest';
import { detectSessionLimit, sanitizeToolCallRecord } from '../../src/core/adapters/types.js';

describe('sanitizeToolCallRecord', () => {
  it('preserves complete tool arguments, output, and errors while redacting secrets', () => {
    const longValue = 'detail '.repeat(1_000);
    const record = sanitizeToolCallRecord({
      id: 'call-1',
      runId: 1,
      featureId: 'feat-1',
      tool: 'codex',
      sequence: 1,
      phase: 'failed',
      name: 'shell',
      arguments: { command: longValue, apiKey: 'must-not-leak' },
      output: longValue,
      step: null,
      startedAt: '2026-07-17T00:00:00.000Z',
      completedAt: '2026-07-17T00:00:01.000Z',
      error: longValue,
    });

    expect(record.arguments).toEqual({ command: longValue, apiKey: '[REDACTED]' });
    expect(record.output).toBe(longValue);
    expect(record.error).toBe(longValue);
  });
});

describe('detectSessionLimit (H35 — tail-only scan)', () => {
  it('detects a genuine limit error printed at the end of stderr', () => {
    const stdout = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hit a provider error while working.' }] } });
    const stderr = 'Error: rate limit exceeded, please retry later';

    expect(detectSessionLimit(stdout, stderr)).toBe('rate limit');
  });

  it('ignores an incidental mention buried earlier in a long transcript', () => {
    const stdout = [
      'commit 0767d46 feat(notify): suggest and enable adapter fallback resume on Telegram session limit (#218)',
      'x'.repeat(500),
      'MSQ_DONE: Implemented and validated.',
    ].join('\n');

    expect(detectSessionLimit(stdout, '')).toBeNull();
  });

  it('still detects a genuine limit error even without stderr, when it is the closing line', () => {
    const stdout = `${'x'.repeat(200)}\nsession limit reached, try again later`;

    expect(detectSessionLimit(stdout, '')).toBe('session limit');
  });

  it('ignores trailing whitespace/newlines after the real error when locating the tail', () => {
    const stdout = `${'x'.repeat(200)}\nsession limit reached\n\n  \n`;

    expect(detectSessionLimit(stdout, '')).toBe('session limit');
  });
});
