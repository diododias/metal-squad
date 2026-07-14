import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KanbanCard, toShortFeatureId } from '../../src/web/client/components/data/KanbanCard.js';

const run = {
  featureId: 'feat-52',
  title: 'Legacy feature',
  status: 'done' as const,
};

describe('KanbanCard persisted identity', () => {
  it('shows the feature description before the generated ID', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, persistedId: 'F-23456789' }} />);
    expect(html.indexOf('Legacy feature')).toBeLessThan(html.indexOf('F-23456789'));
  });

  it('renders the persisted catalog ID when available', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, persistedId: 'F-23456789' }} />);
    expect(html).toContain('F-23456789');
    expect(html).not.toContain(toShortFeatureId(run.featureId));
  });

  it('uses the short hash only as a display fallback', () => {
    const html = renderToStaticMarkup(<KanbanCard run={run} />);
    expect(html).toContain(toShortFeatureId(run.featureId));
  });
});
