import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkItemActions } from '../../src/web/client/components/WorkItemActions.js';
import type { AllowedLifecycle } from '../../src/web/types.js';

const allowed: AllowedLifecycle = {
  state: 'pristine', archived: false, deleted: false,
  archive: true, delete: true, cancel: false, restore: false, blockedReason: null,
};
const eligibility = { canStart: true, reason: null, blockedByDependencies: [], repoUnhealthy: false };

function render(pill: React.ComponentProps<typeof WorkItemActions>['pill'], overrides: Partial<React.ComponentProps<typeof WorkItemActions>> = {}): string {
  return renderToStaticMarkup(<WorkItemActions
    id="F-1" name="Item one" revision={1} allowed={allowed} eligibility={eligibility}
    pill={pill} pipelineId={7} send={vi.fn()} actionResults={{}} onStart={vi.fn()} {...overrides}
  />);
}

function clickHandler(props: React.ComponentProps<typeof WorkItemActions>, label: string): () => void {
  let captured: React.ReactNode = null;
  function Host(): React.JSX.Element | null { captured = WorkItemActions(props); return captured; }
  renderToStaticMarkup(<Host />);
  let found: (() => void) | undefined;
  const walk = (node: React.ReactNode): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!React.isValidElement(node)) return;
    const nodeProps = node.props as { children?: React.ReactNode; onClick?: () => void };
    if (nodeProps.children === label && nodeProps.onClick) found ??= nodeProps.onClick;
    React.Children.forEach(nodeProps.children, walk);
  };
  walk(captured);
  if (!found) throw new Error(`no clickable ${label}`);
  return found;
}

describe('WorkItemActions', () => {
  it('shows Start only for TODO and retains the start eligibility reason', () => {
    expect(render('not_started')).toContain('>Start<');
    expect(render('running')).not.toContain('>Start<');
    expect(render('blocked')).not.toContain('>Start<');
    expect(render('done')).not.toContain('>Start<');
    expect(render('not_started', { eligibility: { ...eligibility, canStart: false, reason: 'Pending dependencies: F-0' } }))
      .toContain('title="Pending dependencies: F-0"');
  });

  it('shows Resume and Abort together for BLOCKED and resumes its pipeline', () => {
    const send = vi.fn();
    const props: React.ComponentProps<typeof WorkItemActions> = {
      id: 'F-1', name: 'Item one', revision: 1, allowed: { ...allowed, delete: false }, eligibility,
      pill: 'blocked', pipelineId: 7, send, actionResults: {}, onStart: vi.fn(),
    };
    const html = renderToStaticMarkup(<WorkItemActions {...props} />);
    expect(html).toContain('>Resume<');
    expect(html).toContain('>Abort<');
    expect(html).not.toContain('>Start<');
    expect(html).not.toContain('>Delete<');
    clickHandler(props, 'Resume')();
    expect(send).toHaveBeenCalledWith({ type: 'action:resumePipeline', pipelineId: 7 });
  });

  it('keeps Delete for a pristine item and offers Abort during an active pipeline', () => {
    expect(render('not_started')).toContain('>Delete<');
    expect(render('running', { allowed: { ...allowed, delete: false } })).toContain('>Abort<');
  });

  it('offers failed-only transitions and a clone callback only for done items', () => {
    const send = vi.fn();
    const failed: React.ComponentProps<typeof WorkItemActions> = {
      id: 'F-1', name: 'Item one', revision: 7, allowed, eligibility, pill: 'failed', pipelineId: null, send, actionResults: {}, onStart: vi.fn(),
    };
    const failedHtml = renderToStaticMarkup(<WorkItemActions {...failed} />);
    expect(failedHtml).toContain('>Back to TODO<');
    expect(failedHtml).toContain('>Mark as Done<');
    expect(failedHtml).not.toContain('>Clone<');
    clickHandler(failed, 'Back to TODO')();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'action:reopenFailedWorkItem', workItemId: 'F-1', expectedRevision: 7 }));

    const onClone = vi.fn();
    expect(renderToStaticMarkup(<WorkItemActions {...failed} pill="done" onClone={onClone} />)).toContain('>Clone<');
    clickHandler({ ...failed, pill: 'done', onClone }, 'Clone')();
    expect(onClone).toHaveBeenCalledOnce();
  });
});
