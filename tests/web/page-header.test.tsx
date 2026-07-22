// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PageHeader } from '../../src/web/client/PageHeader.js';

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

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => { root.unmount(); }); });
  document.body.replaceChildren();
});

describe('PageHeader breadcrumb', () => {
  it('renders a legacy single-node breadcrumb unchanged', () => {
    const container = render(<PageHeader title="Detail" breadcrumb="Some subtitle text" />);
    expect(container.textContent).toContain('Some subtitle text');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders a legacy element breadcrumb unchanged', () => {
    const container = render(<PageHeader title="Detail" breadcrumb={<button>Back</button>} />);
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Back');
  });

  it('renders a two-level trail with separator and navigates per level', () => {
    const container = render(<PageHeader title="Epic One" breadcrumb={[
      { label: 'Projects', href: '/projects' },
      { label: 'Project One', href: '/projects/proj-1' },
    ]} />);
    expect(container.textContent).toContain('Projects');
    expect(container.textContent).toContain('›');
    expect(container.textContent).toContain('Project One');

    const buttons = [...container.querySelectorAll('button')];
    expect(buttons).toHaveLength(2);
    act(() => { buttons[1]?.click(); });
    expect(window.location.hash).toBe('#/projects/proj-1');
    act(() => { buttons[0]?.click(); });
    expect(window.location.hash).toBe('#/projects');
  });

  it('renders no breadcrumb block when the prop is omitted', () => {
    const container = render(<PageHeader title="Plain" />);
    expect(container.querySelector('h1')?.textContent).toBe('Plain');
  });
});
