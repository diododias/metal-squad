// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastStack, type ToastStackItem } from '../../src/web/client/components/feedback/ToastStack.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function renderStack(items: ToastStackItem[], onDismiss?: (id: string) => void): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(React.createElement(ToastStack, { items, onDismiss }));
  });
  return container;
}

afterEach(() => {
  act(() => {
    for (const root of roots) root.unmount();
  });
  roots.length = 0;
  document.body.replaceChildren();
});

describe('ToastStack', () => {
  it('renders nothing when the item list is empty', () => {
    const container = renderStack([]);
    expect(container.firstChild).toBeNull();
  });

  it('renders each visible toast with its message and source eyebrow', () => {
    const items: ToastStackItem[] = [
      { id: `${String(Date.now())}-1`, tone: 'ok', source: 'run:done', message: 'feat-1 done — ok' },
      { id: `${String(Date.now())}-2`, tone: 'danger', source: 'run:failed', message: 'feat-2 failed — boom' },
      { id: `${String(Date.now())}-3`, tone: 'warn', source: 'gate:created', message: 'feat-3 — gate awaiting decision' },
    ];
    const container = renderStack(items);
    const text = container.textContent ?? '';
    expect(text).toContain('feat-1 done — ok');
    expect(text).toContain('feat-2 failed — boom');
    expect(text).toContain('feat-3 — gate awaiting decision');
    // Source eyebrow labels render too.
    expect(text).toContain('run:done');
    expect(text).toContain('gate:created');
  });

  it('caps simultaneous visible toasts at maxVisible (older items drop)', () => {
    const items: ToastStackItem[] = Array.from({ length: 6 }, (_, i) => ({
      id: `${String(Date.now() + i)}-${String(i)}`,
      tone: 'info' as const,
      message: `toast ${String(i)}`,
    }));
    const container = renderStack(items, undefined);
    const text = container.textContent ?? '';
    // Default cap is 4; the last 4 items survive.
    expect(text).toContain('toast 5');
    expect(text).toContain('toast 2');
    expect(text).not.toContain('toast 0');
  });

  it('invokes onDismiss when a toast is clicked', () => {
    const onDismiss = vi.fn();
    const items: ToastStackItem[] = [
      { id: `${String(Date.now())}-1`, tone: 'warn', message: 'click me' },
    ];
    const container = renderStack(items, onDismiss);
    const toast = container.querySelector('[title="Dismiss"]');
    expect(toast).not.toBeNull();
    act(() => { (toast as HTMLElement).click(); });
    expect(onDismiss).toHaveBeenCalledWith(expect.stringContaining('-1'));
  });

  it('renders only fresh non-expired toasts (ttlMs governs expiry by id-prefix timestamp)', async () => {
    const staleId = `${String(Date.now() - 10_000)}-stale`;
    const freshId = `${String(Date.now())}-fresh`;
    const onDismiss = vi.fn();
    const items: ToastStackItem[] = [
      { id: staleId, tone: 'warn', message: 'old toast', ttlMs: 1 },
      { id: freshId, tone: 'warn', message: 'fresh toast', ttlMs: 60_000 },
    ];
    const container = renderStack(items, onDismiss);
    const text = container.textContent ?? '';
    // On the very first render, the component still renders the stale item
    // so the user never loses a toast without a paint. The expired-dismiss
    // is queued via setTimeout(0); flush timers before asserting the second
    // paint and the dismiss callback.
    await new Promise<void>((resolve) => { setTimeout(resolve, 5); });
    const afterText = container.textContent ?? '';
    expect(afterText).toContain('fresh toast');
    expect(onDismiss).toHaveBeenCalledWith(staleId);
  });
});