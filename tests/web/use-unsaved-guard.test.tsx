// @vitest-environment happy-dom

import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUnsavedGuard, type UnsavedGuard } from '../../src/web/client/hooks/useUnsavedGuard.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let guard: UnsavedGuard | undefined;
let setDirty: ((dirty: boolean) => void) | undefined;
let confirmations = 0;

function Harness(): null {
  const [dirty, setHarnessDirty] = useState(false);
  guard = useUnsavedGuard(dirty, () => { confirmations += 1; setHarnessDirty(false); });
  setDirty = setHarnessDirty;
  return null;
}

beforeEach(() => {
  window.location.hash = '#/config';
  confirmations = 0;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => { root?.render(<Harness />); });
});

afterEach(() => {
  act(() => { root?.unmount(); });
  root = undefined;
  guard = undefined;
  document.body.replaceChildren();
});

describe('useUnsavedGuard', () => {
  it('navigates immediately when the page is clean', () => {
    act(() => { guard?.navigate('/runs'); });
    expect(window.location.hash).toBe('#/runs');
    expect(guard?.isConfirmingLeave).toBe(false);
  });

  it('asks before navigating away from a dirty page and keeps the draft on cancel', () => {
    act(() => { setDirty?.(true); });
    act(() => { guard?.navigate('/runs'); });
    expect(window.location.hash).toBe('#/config');
    expect(guard?.isConfirmingLeave).toBe(true);
    act(() => { guard?.cancel(); });
    expect(window.location.hash).toBe('#/config');
    expect(confirmations).toBe(0);
  });

  it('discards the dirty draft only after confirmation and then navigates', () => {
    act(() => { setDirty?.(true); });
    act(() => { guard?.navigate('/runs'); });
    act(() => { guard?.discard(); });
    expect(confirmations).toBe(1);
    expect(window.location.hash).toBe('#/runs');
  });

  it('restores a browser hash change while dirty and requests confirmation', () => {
    act(() => { setDirty?.(true); });
    window.location.hash = '#/board';
    act(() => { guard?.onHashChange(); });
    expect(window.location.hash).toBe('#/config');
    expect(guard?.isConfirmingLeave).toBe(true);
  });

  it('registers beforeunload only for a dirty page', () => {
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
    act(() => { setDirty?.(true); });
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });
});
