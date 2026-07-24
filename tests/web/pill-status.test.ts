import { describe, expect, it } from 'vitest';
import { pillStatus } from '../../src/web/client/lib/pillStatus.js';

describe('pillStatus', () => {
  it.each([
    ['running', 'running'],
    ['paused', 'blocked'],
    ['blocked', 'blocked'],
    ['aborting', 'aborted'],
    ['aborted', 'aborted'],
    ['done', 'done'],
    ['failed', 'failed'],
  ] as const)('maps pipeline %s to %s', (pipelineStatus, expected) => {
    expect(pillStatus({ status: 'running', pipelineStatus })).toBe(expected);
  });

  it('returns not_started when the Work Item has no run', () => {
    expect(pillStatus({})).toBe('not_started');
  });

  it('uses a terminal run status when no pipeline is present', () => {
    expect(pillStatus({ status: 'failed' })).toBe('failed');
  });

  it('keeps manual Epic states visually compatible', () => {
    expect(pillStatus({ status: 'todo' })).toBe('not_started');
    expect(pillStatus({ status: 'in_progress' })).toBe('running');
    expect(pillStatus({ status: 'done' })).toBe('done');
  });
});
