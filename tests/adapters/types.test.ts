import { describe, expect, it } from 'vitest';
import { sanitizeToolCallRecord } from '../../src/core/adapters/types.js';

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
