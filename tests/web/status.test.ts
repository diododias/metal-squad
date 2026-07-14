import React from 'react';
import { describe, expect, it } from 'vitest';
import { RunStatusIndicator } from '../../src/web/client/components/status/RunStatusIndicator.js';
import { createSessionStatus } from '../fixtures/heartbeat-status.js';

describe('RunStatusIndicator', () => {
  it('renders the structured running state and elapsed time', () => {
    const element = RunStatusIndicator({ status: createSessionStatus({ elapsedMs: 12_000 }) });
    expect(React.isValidElement(element)).toBe(true);
    expect(element.props['data-status']).toBe('running');
  });

  it('keeps the running label when animation is disabled', () => {
    const element = RunStatusIndicator({ status: createSessionStatus(), spinnerEnabled: false });
    expect(element.props.children.some((child: React.ReactNode) => React.isValidElement(child) && child.type === 'span' && child.props.className === 'msq-status-spinner')).toBe(false);
    expect(JSON.stringify(element)).toContain('Running');
  });

  it('labels idle and exposes the idle duration', () => {
    const element = RunStatusIndicator({ status: createSessionStatus({ status: 'idle', idleMs: 4_000 }) });
    expect(element.props['data-status']).toBe('idle');
    expect(JSON.stringify(element)).toContain('Idle / Waiting');
  });
});
