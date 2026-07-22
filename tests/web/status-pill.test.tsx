// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { StatusPill } from '../../src/web/client/components/core/StatusPill.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

function render(element: React.JSX.Element): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => { root.render(element); });
  return container;
}

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => { root.unmount(); }); });
  document.body.replaceChildren();
});

describe('StatusPill', () => {
  it('renders the neutral not_started variant with a default label and no spinner', () => {
    const container = render(<StatusPill status="not_started" />);
    const pill = container.querySelector('span') as HTMLSpanElement;
    expect(pill.textContent).toContain('not started');
    expect(pill.style.color).toBe('var(--text-faint)');
    expect(pill.getAttribute('style')).toContain('border-color: var(--border-dim)');
    expect(container.querySelector('.msq-status-spinner')).toBeNull();
  });

  it('keeps the aborted variant visually distinct from not_started', () => {
    const container = render(<StatusPill status="aborted" />);
    const pill = container.querySelector('span') as HTMLSpanElement;
    expect(pill.textContent).toContain('aborted');
    expect(pill.style.color).toBe('var(--text-dim)');
    expect(pill.getAttribute('style')).toContain('border-color: var(--text-dim)');
  });

  it('keeps run statuses unchanged', () => {
    const container = render(<StatusPill status="running" label="running" />);
    expect(container.querySelector('.msq-status-spinner')).not.toBeNull();
    const done = render(<StatusPill status="done" />);
    expect((done.querySelector('span') as HTMLSpanElement).style.color).toBe('var(--accent-ok)');
  });
});
