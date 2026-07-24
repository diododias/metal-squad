// @vitest-environment happy-dom

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveElapsed } from '../../src/web/client/hooks/useLiveElapsed.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;
let capturedElapsed: string | null = null;
let setActive: ((v: boolean) => void) | undefined;
let setStartedAt: ((v: string | null) => void) | undefined;

function Harness(): null {
  const [startedAt, setS] = useState<string | null>(null);
  const [active, setA] = useState(false);
  setActive = setA;
  setStartedAt = setS;
  capturedElapsed = useLiveElapsed(startedAt, active);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => { root?.render(React.createElement(Harness)); });
});

afterEach(() => {
  act(() => { root?.unmount(); });
  root = undefined;
  container?.remove();
  container = undefined;
  vi.useRealTimers();
});

describe('useLiveElapsed', () => {
  it('SC-001: increments elapsed every second when active', () => {
    const startedAt = new Date(Date.now() - 5000).toISOString();
    act(() => { setStartedAt?.(startedAt); setActive?.(true); });
    const before = capturedElapsed;
    act(() => { vi.advanceTimersByTime(1000); });
    expect(capturedElapsed).not.toBe(before);
    expect(capturedElapsed).toMatch(/\d+s/);
  });

  it('SC-002: does not tick when not active (terminal run)', () => {
    const startedAt = new Date(Date.now() - 30000).toISOString();
    act(() => { setStartedAt?.(startedAt); setActive?.(false); });
    const frozen = capturedElapsed;
    act(() => { vi.advanceTimersByTime(5000); });
    expect(capturedElapsed).toBe(frozen);
  });

  it('SC-003: clears interval on unmount — no error thrown after timers fire', () => {
    const startedAt = new Date(Date.now() - 10000).toISOString();
    act(() => { setStartedAt?.(startedAt); setActive?.(true); });
    act(() => { root?.unmount(); root = undefined; });
    expect(() => { vi.advanceTimersByTime(5000); }).not.toThrow();
  });

  it('returns null when startedAt is null', () => {
    act(() => { setStartedAt?.(null); setActive?.(true); });
    expect(capturedElapsed).toBeNull();
  });

  it('stops ticking when active transitions from true to false', () => {
    const startedAt = new Date(Date.now() - 10000).toISOString();
    act(() => { setStartedAt?.(startedAt); setActive?.(true); });
    act(() => { setActive?.(false); });
    const frozen = capturedElapsed;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(capturedElapsed).toBe(frozen);
  });
});
