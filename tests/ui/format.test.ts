import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatElapsed,
  formatHeartbeatLine,
  formatTokensIO,
  getRunStatusTone,
  getVerticalBudget,
} from '../../src/ui/format.js';
import { getNotificationTone } from '../../src/ui/theme/styles.js';

describe('ui format helpers', () => {
  it('treats sqlite timestamps as UTC and never shows negative elapsed time', () => {
    expect(formatElapsed('2026-07-07 00:49:25', '2026-07-07 01:02:30')).toBe('13m5s');
    expect(formatElapsed('2026-07-07 01:02:30', '2026-07-07 00:49:25')).toBe('0s');
    expect(formatClock('2026-07-07 01:02:30')).toBe('01:02');
  });

  it('includes cached tokens in the summary', () => {
    expect(formatTokensIO(3_000, 12_000, 400)).toBe('3.0k in/12.0k cache/400out');
  });

  it('maps run statuses and notification events to semantic theme tones', () => {
    expect(getRunStatusTone('running')).toBe('running');
    expect(getRunStatusTone('done')).toBe('done');
    expect(getRunStatusTone('failed')).toBe('failed');
    expect(getRunStatusTone('blocked')).toBe('blocked');
    expect(getRunStatusTone('aborted')).toBe('aborted');

    expect(getNotificationTone('run:start')).toBe('info');
    expect(getNotificationTone('run:done')).toBe('success');
    expect(getNotificationTone('gate:created')).toBe('warning');
    expect(getNotificationTone('run:failed')).toBe('error');
    expect(getNotificationTone('stage:request-created')).toBe('accent');
  });

  it('splits terminal height into short/regular/tall vertical budgets (F31 item 1)', () => {
    expect(getVerticalBudget(20)).toBe('short');
    expect(getVerticalBudget(23)).toBe('short');
    expect(getVerticalBudget(24)).toBe('regular');
    expect(getVerticalBudget(40)).toBe('regular');
    expect(getVerticalBudget(41)).toBe('tall');
    expect(getVerticalBudget(80)).toBe('tall');
  });

  it('hides heartbeat diagnostic metrics and surfaces only the agent activity message (US6/FR-010)', () => {
    // Normal heartbeat: suffix survives alone, no stdout/stderr/idle/elapsed noise.
    expect(
      formatHeartbeatLine('[msq] codex feat-10 running for 42s (stdout 474569B stderr 336B idle 5s) thinking...', 80),
    ).toBe('thinking...');
    // No suffix → bounded "thinking..." fallback rather than an empty line.
    expect(
      formatHeartbeatLine('[msq] claude feat-2 running for 3s (stdout 0B stderr 0B idle 0s)', 80),
    ).toBe('thinking...');
    // Long suffix truncates with ellipsis, never re-emitting diagnostics.
    const longSuffix = 'a'.repeat(120);
    expect(
      formatHeartbeatLine(`[msq] codex feat-1 running for 7s (stdout 4B stderr 0B idle 1s) ${longSuffix}`, 40),
    ).toBe(`${'a'.repeat(37)}...`);
    // Non-diagnostic / error line does not match the pattern → rendered raw (so
    // agents/agents error messages stay visible, only the recognized heartbeat
    // diagnostic noise is hidden).
    expect(formatHeartbeatLine('Error: pipeline crashed: ENOTFOUND', 80)).toBe('Error: pipeline crashed: ENOTFOUND');
  });
});
