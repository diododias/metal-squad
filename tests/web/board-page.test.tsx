import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardPage } from '../../src/web/client/pages/BoardPage.js';
import type { MsqWebState } from '../../src/web/types.js';

const state = {
  runs: [],
  pendingFeatures: [],
  featureCatalog: {},
} as unknown as MsqWebState;

function renderBoard(): string {
  return renderToStaticMarkup(
    <BoardPage
      state={state}
      isMobile={false}
      onOpenRun={() => {}}
      onOpenBacklogItem={() => {}}
    />,
  );
}

describe('BoardPage view', () => {
  it('renders only the status columns', () => {
    const html = renderBoard();
    expect(html).toContain('IN PROGRESS / BLOCKED');
    expect(html).toContain('DONE');
    expect(html).toContain('FALHA / CANCELED');
  });

  it('does not render any workflow stage columns', () => {
    const html = renderBoard();
    for (const stage of ['specify', 'plan', 'tasks', 'implement', 'validate']) {
      expect(html).not.toContain(stage.toUpperCase());
    }
  });

  it('does not render a view toggle control', () => {
    const html = renderBoard();
    expect(html).not.toContain('by status');
    expect(html).not.toContain('by workflow stage');
  });
});
