// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditableSelectField } from '../../src/web/client/components/core/EditableSelectField.js';
import { EditableTextField } from '../../src/web/client/components/core/EditableTextField.js';
import { EditableToggleField } from '../../src/web/client/components/core/EditableToggleField.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];

function render(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(element);
  });

  return container;
}

function mount(): { container: HTMLElement; rerender: (element: React.ReactElement) => void } {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  return {
    container,
    rerender(element) {
      act(() => {
        root.render(element);
      });
    },
  };
}

function dispatchChange(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value');
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  act(() => {
    roots.forEach((root) => { root.unmount(); });
  });
  roots = [];
  document.body.replaceChildren();
});

describe('editable controls', () => {
  it('associates labels and delivers proposed text values', () => {
    const onChange = vi.fn();
    const container = render(
      <EditableTextField id="summary" label="Summary" value="before" initialValue="before" onChange={onChange} />,
    );
    const input = container.querySelector('input') as HTMLInputElement;
    const label = container.querySelector('label');

    expect(label?.htmlFor).toBe(input.id);
    act(() => { dispatchChange(input, 'after'); });
    expect(onChange).toHaveBeenCalledWith('after');
  });

  it('associates labels and delivers proposed selected values', () => {
    const onChange = vi.fn();
    const container = render(
      <EditableSelectField
        id="tool"
        label="Tool"
        value="codex"
        initialValue="codex"
        options={[{ value: 'codex', label: 'Codex' }, { value: 'claude', label: 'Claude' }]}
        onChange={onChange}
      />,
    );
    const select = container.querySelector('select') as HTMLSelectElement;
    const label = container.querySelector('label');

    expect(label?.htmlFor).toBe(select.id);
    act(() => { dispatchChange(select, 'claude'); });
    expect(onChange).toHaveBeenCalledWith('claude');
  });

  it('associates labels and delivers proposed boolean values', () => {
    const onChange = vi.fn();
    const container = render(
      <EditableToggleField id="auto-start" label="Auto start" value={false} initialValue={false} onChange={onChange} />,
    );
    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const label = container.querySelector('label');

    expect(label?.htmlFor).toBe(input.id);
    act(() => {
      input.click();
    });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('derives text dirty state from the current and refreshed initial values', () => {
    const view = mount();
    view.rerender(<EditableTextField id="summary" label="Summary" value="saved" initialValue="saved" onChange={vi.fn()} />);
    expect(view.container.textContent).not.toContain('modified');

    view.rerender(<EditableTextField id="summary" label="Summary" value="draft" initialValue="saved" onChange={vi.fn()} />);
    expect(view.container.textContent).toContain('modified');

    view.rerender(<EditableTextField id="summary" label="Summary" value="draft" initialValue="draft" onChange={vi.fn()} />);
    expect(view.container.textContent).not.toContain('modified');
  });

  it('derives select dirty state from the current and refreshed initial values', () => {
    const view = mount();
    view.rerender(<EditableSelectField id="tool" label="Tool" value="codex" initialValue="codex" options={[]} onChange={vi.fn()} />);
    expect(view.container.textContent).not.toContain('modified');

    view.rerender(<EditableSelectField id="tool" label="Tool" value="claude" initialValue="codex" options={[]} onChange={vi.fn()} />);
    expect(view.container.textContent).toContain('modified');

    view.rerender(<EditableSelectField id="tool" label="Tool" value="claude" initialValue="claude" options={[]} onChange={vi.fn()} />);
    expect(view.container.textContent).not.toContain('modified');
  });

  it('derives toggle dirty state from the current and refreshed initial values', () => {
    const view = mount();
    view.rerender(<EditableToggleField id="auto-start" label="Auto start" value={false} initialValue={false} onChange={vi.fn()} />);
    expect(view.container.textContent).not.toContain('modified');

    view.rerender(<EditableToggleField id="auto-start" label="Auto start" value initialValue={false} onChange={vi.fn()} />);
    expect(view.container.textContent).toContain('modified');

    view.rerender(<EditableToggleField id="auto-start" label="Auto start" value initialValue onChange={vi.fn()} />);
    expect(view.container.textContent).not.toContain('modified');
  });

  it('keeps undefined text explanatory and disabled dirty text visibly unchanged', () => {
    const missing = render(
      <EditableTextField id="summary" label="Summary" value={undefined} initialValue={undefined} missingValueLabel="No summary configured" onChange={vi.fn()} />,
    );
    expect((missing.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(missing.textContent).toContain('No summary configured');

    const disabled = render(
      <EditableTextField id="summary-disabled" label="Summary" value="draft" initialValue="saved" disabled onChange={vi.fn()} />,
    );
    expect((disabled.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(disabled.textContent).toContain('modified');
  });

  it('keeps select empty and unavailable values understandable', () => {
    const empty = render(
      <EditableSelectField id="tool-empty" label="Tool" value={undefined} initialValue={undefined} options={[]} missingValueLabel="No tool configured" onChange={vi.fn()} />,
    );
    const emptySelect = empty.querySelector('select') as HTMLSelectElement;
    expect(emptySelect.disabled).toBe(true);
    expect(empty.textContent).toContain('No tool configured');

    const unavailable = render(
      <EditableSelectField
        id="tool-unavailable"
        label="Tool"
        value="legacy"
        initialValue="codex"
        options={[{ value: 'codex', label: 'Codex' }]}
        onChange={vi.fn()}
      />,
    );
    const unavailableOption = unavailable.querySelector('option[value="legacy"]') as HTMLOptionElement;
    expect(unavailableOption.disabled).toBe(true);
    expect(unavailableOption.textContent).toContain('unavailable');
    expect(unavailable.textContent).toContain('modified');
  });

  it('keeps an undefined boolean distinct from an unchecked boolean', () => {
    const container = render(
      <EditableToggleField id="auto-start" label="Auto start" value={undefined} initialValue={undefined} missingValueLabel="Auto start is not configured" onChange={vi.fn()} />,
    );
    const input = container.querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(input.indeterminate).toBe(true);
    expect(input.disabled).toBe(true);
    expect(container.textContent).toContain('Auto start is not configured');
  });
});
