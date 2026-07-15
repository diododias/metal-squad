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

describe('KanbanCard steps sequence', () => {
  it('marks previous stages done, the current stage highlighted and later stages pending', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', stage: 'implement', stages: ['plan', 'implement', 'review'] }} />,
    );
    expect(html).toContain('✓ plan');
    expect(html).toContain('▸ implement');
    expect(html).toContain('· review');
  });

  it('marks every stage as done when status is done, regardless of stage', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'done', stage: 'plan', stages: ['plan', 'implement', 'review'] }} />,
    );
    expect(html).toContain('✓ plan');
    expect(html).toContain('✓ implement');
    expect(html).toContain('✓ review');
  });

  it('marks every stage as pending when status is todo, regardless of stage', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'todo', stage: 'implement', stages: ['plan', 'implement', 'review'] }} />,
    );
    expect(html).toContain('· plan');
    expect(html).toContain('· implement');
    expect(html).toContain('· review');
  });

  it('renders without error and without a steps section when stages is absent', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, stage: 'implement' }} />);
    expect(html).not.toContain('▸');
    expect(html).not.toContain('→ implement');
  });

  it('renders without error and without a steps section when stages is empty', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, stage: 'implement', stages: [] }} />);
    expect(html).not.toContain('▸');
  });

  it('renders the sequence without a current marker when stage is not found in stages', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', stage: 'unknown', stages: ['plan', 'implement', 'review'] }} />,
    );
    expect(html).not.toContain('▸');
    expect(html).toContain('plan');
    expect(html).toContain('implement');
    expect(html).toContain('review');
  });

  it('renders all stages in the markup for long workflows without truncation', () => {
    const stages = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', stage: 'd', stages }} />,
    );
    for (const stage of stages) {
      expect(html).toContain(stage);
    }
  });
});
