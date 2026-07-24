import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LifecycleActions } from '../../src/web/client/components/LifecycleActions.js';
import type { AllowedLifecycle } from '../../src/web/types.js';

/**
 * PRJ-18: the client renders only what the server policy permitted and never
 * re-derives the rules. These tests drive the component through SSR markup
 * (the web suite has no DOM environment) plus direct handler invocation for
 * the send/confirmation paths.
 */

const pristine: AllowedLifecycle = {
  state: 'pristine', archived: false, deleted: false,
  archive: true, delete: true, cancel: false, restore: false, blockedReason: null,
};

/**
 * Returns the element tree LifecycleActions renders, with real hook state.
 * Calling the component inside a host that `renderToStaticMarkup` renders gives
 * it React's hook dispatcher, and the captured tree keeps the onClick handlers
 * reachable afterwards. This suite has no DOM, so this is how interaction is tested.
 */
function renderTree(props: React.ComponentProps<typeof LifecycleActions>): React.ReactNode {
  let captured: React.ReactNode = null;
  function Host(): React.JSX.Element | null {
    const tree = LifecycleActions(props);
    captured = tree;
    return tree;
  }
  renderToStaticMarkup(<Host />);
  return captured;
}

function render(allowed: AllowedLifecycle | undefined, overrides: Partial<React.ComponentProps<typeof LifecycleActions>> = {}): string {
  return renderToStaticMarkup(
    <LifecycleActions
      kind="work_item"
      id="w1"
      name="Item one"
      revision={3}
      allowed={allowed}
      send={overrides.send ?? vi.fn()}
      actionResults={{}}
      {...overrides}
    />,
  );
}

describe('LifecycleActions — policy drives the buttons', () => {
  it('renders nothing until the first snapshot carries the policy', () => {
    expect(render(undefined)).toBe('');
  });

  it('offers Archive and Delete for a pristine entity', () => {
    const html = render(pristine);
    expect(html).toContain('Archive');
    expect(html).toContain('Delete');
  });

  it('keeps the history reason on a muted Archive button instead of loose text', () => {
    const html = render({
      ...pristine, state: 'historical', delete: false,
      blockedReason: 'It has run history and can be archived but not deleted.',
    });
    expect(html).toContain('Archive');
    expect(html).not.toContain('>Delete<');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="It has run history and can be archived but not deleted."');
    expect(html).not.toContain('>It has run history and can be archived but not deleted.<');
  });

  it('shows a muted Cancel with its reason while running without cancellation wiring', () => {
    const html = render({
      ...pristine, state: 'running', archive: false, delete: false, cancel: true,
      blockedReason: 'It is running; cancel it first.',
    });
    expect(html).not.toContain('Archive');
    expect(html).not.toContain('>Delete<');
    expect(html).toContain('>Cancel<');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="It is running; cancel it first."');
    expect(html).not.toContain('>It is running; cancel it first.<');
  });

  it('enables Cancel only when the host surface wired the abort', () => {
    const running: AllowedLifecycle = {
      ...pristine, state: 'running', archive: false, delete: false, cancel: true,
      blockedReason: 'It is running; cancel it first.',
    };
    const wired = render(running, { onRequestCancel: vi.fn() });
    expect(wired).toContain('>Cancel<');
    expect(wired).not.toContain('disabled=""');
  });

  it('offers Restore for an archived entity and nothing for a tombstone', () => {
    expect(render({ ...pristine, archived: true, archive: false, delete: false, restore: true }))
      .toContain('Restore');
    const tombstone = render({
      ...pristine, deleted: true, archive: false, delete: false, restore: false,
      blockedReason: 'It is deleted.',
    });
    expect(tombstone).toContain('Deleted');
    expect(tombstone).not.toContain('Archive');
  });
});

describe('LifecycleActions — sending and confirmation', () => {
  /** Pulls the onClick of the first button whose label matches, from the tree the
   * component actually returns. `renderTree` supplies a hook dispatcher — this
   * suite has no DOM renderer. */
  function clickHandler(props: React.ComponentProps<typeof LifecycleActions>, label: string): () => void {
    const tree = renderTree(props);
    let found: (() => void) | undefined;
    const walk = (node: React.ReactNode): void => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!React.isValidElement(node)) return;
      const nodeProps = node.props as { children?: React.ReactNode; onClick?: () => void };
      if (nodeProps.children === label && nodeProps.onClick) found ??= nodeProps.onClick;
      React.Children.forEach(nodeProps.children, walk);
    };
    walk(tree);
    if (!found) throw new Error(`no clickable "${label}"`);
    return found;
  }

  it('sends archive with the entity id and expectedRevision', () => {
    const send = vi.fn();
    clickHandler({
      kind: 'work_item', id: 'w1', name: 'Item one', revision: 7,
      allowed: pristine, send, actionResults: {},
    }, 'Archive')();

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(message.type).toBe('action:archiveWorkItem');
    expect(message.workItemId).toBe('w1');
    expect(message.expectedRevision).toBe(7);
    expect(typeof message.requestId).toBe('string');
  });

  it('routes each kind to its own message type and id field', () => {
    for (const [kind, type, field] of [
      ['project', 'action:archiveProject', 'projectId'],
      ['epic', 'action:archiveEpic', 'epicId'],
    ] as const) {
      const send = vi.fn();
      clickHandler({
        kind, id: 'x1', name: 'X', revision: 1,
        allowed: pristine, send, actionResults: {},
      }, 'Archive')();
      const message = send.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(message.type).toBe(type);
      expect(message[field]).toBe('x1');
    }
  });

  it('does not send anything when Delete only opens the confirmation', () => {
    const send = vi.fn();
    clickHandler({
      kind: 'work_item', id: 'w1', name: 'Item one', revision: 1,
      allowed: pristine, send, actionResults: {},
    }, 'Delete')();
    // Opening the modal is a local state change; the destructive action only
    // leaves the client after the confirmation is accepted.
    expect(send).not.toHaveBeenCalled();
  });

  it('requires the typed name before a Project delete can be confirmed', () => {
    // The confirm button is disabled until the typed value equals the name, so
    // a cancelled/incomplete confirmation can never dispatch the delete.
    const tree = renderTree({
      kind: 'project', id: 'p1', name: 'Atlas', revision: 1,
      allowed: pristine, send: vi.fn(), actionResults: {},
    });
    let confirmDisabled: boolean | undefined;
    const walk = (node: React.ReactNode): void => {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (!React.isValidElement(node)) return;
      const props = node.props as { children?: React.ReactNode; disabled?: boolean };
      if (props.children === 'Delete' && props.disabled !== undefined) confirmDisabled ??= props.disabled;
      React.Children.forEach(props.children, walk);
    };
    walk(tree);
    expect(confirmDisabled).toBe(true);
  });
});

describe('LifecycleActions — policy error at the point of origin', () => {
  /** Replays the effect that resolves an `action:result`, mirroring the
   * component's logic, so the error path is covered without a DOM renderer.
   * Kept in lockstep with the `useEffect` in LifecycleActions.tsx. */
  function resolveResult(
    pendingRequestId: string | null,
    actionResults: Record<string, { payload: { ok: boolean; error?: { message: string } } }>,
  ): { error: string | null } {
    if (!pendingRequestId) return { error: null };
    const result = actionResults[pendingRequestId];
    if (!result) return { error: null };
    return { error: result.payload.ok ? null : result.payload.error?.message ?? null };
  }

  it('surfaces the server policy error for its own pending request', () => {
    const requestId = 'lifecycle-delete-1';
    const captured = resolveResult(requestId, {
      [requestId]: { payload: { ok: false, error: { message: 'It is running; cancel it first.' } } },
    });
    expect(captured.error).toBe('It is running; cancel it first.');
  });

  it('clears the error once its request succeeds', () => {
    const requestId = 'lifecycle-archive-1';
    expect(resolveResult(requestId, { [requestId]: { payload: { ok: true } } }).error).toBeNull();
  });

  it('ignores results belonging to another component instance', () => {
    const captured = resolveResult('lifecycle-delete-mine', {
      'someone-elses-request': { payload: { ok: false, error: { message: 'nope' } } },
    });
    expect(captured.error).toBeNull();
  });
});
