import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KanbanCard, toShortFeatureId, toShortModelLabel } from '../../src/web/client/components/data/KanbanCard.js';

const run = {
  featureId: 'feat-52',
  title: 'Legacy feature',
  status: 'done' as const,
};

describe('KanbanCard persisted identity', () => {
  it('renders the persisted catalog ID when available', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, persistedId: 'F-23456789' }} />);
    expect(html).toContain('F-23456789');
    expect(html).not.toContain(toShortFeatureId(run.featureId));
  });

  it('uses the short hash only as a display fallback', () => {
    const html = renderToStaticMarkup(<KanbanCard run={run} />);
    expect(html).toContain(toShortFeatureId(run.featureId));
  });

  it('shows the muted epic title with the feature id always rendered beside or below it', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, persistedId: 'F-23456789', epicTitle: 'Web Dashboard' }} />,
    );
    expect(html).toContain('Web Dashboard');
    expect(html).toContain('F-23456789');
    expect(html.indexOf('Web Dashboard')).toBeLessThan(html.indexOf('Legacy feature'));
  });

  it('keeps the feature id in the markup even when the epic title is long', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, persistedId: 'SET-44', epicTitle: 'Settings — M9 (Consolidacao, limpeza e docs finais do modulo)' }} />,
    );
    expect(html).toContain('SET-44');
  });
});

describe('KanbanCard tool rail', () => {
  it('renders tool, model and effort as bordered cells with hover titles', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', tool: 'claude', model: 'claude-sonnet-4-5', effort: 'high' }} />,
    );
    expect(html).toContain('title="tool: claude"');
    expect(html).toContain('title="model: claude-sonnet-4-5"');
    expect(html).toContain('title="effort: high"');
    // Short model label in the cell, full value only in the hover title.
    expect(html).toContain('sonnet-4-5');
  });

  it('omits missing tool fields from the rail', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', tool: 'claude' }} />,
    );
    expect(html).toContain('title="tool: claude"');
    expect(html).not.toContain('title="model:');
    expect(html).not.toContain('title="effort:');
  });

  it('renders no rail when no tool data is present', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, status: 'running' }} />);
    expect(html).not.toContain('title="tool:');
  });

  it('shortens claude model ids for display', () => {
    expect(toShortModelLabel('claude-sonnet-4-5')).toBe('sonnet-4-5');
    expect(toShortModelLabel('gpt-5.6-terra')).toBe('gpt-5.6-terra');
  });
});

describe('KanbanCard status and indicators', () => {
  it('shows a spinner inside the status pill and compact token count for a running card', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', tokens: 1_000_000 }} />,
    );
    expect(html).toContain('msq-status-spinner');
    expect(html).toContain('1000k tok');
  });

  it('shows the auto-advance cell in the tool rail when the workflow auto-advances', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', tool: 'claude', autoAdvance: true }} />,
    );
    expect(html).toContain('title="auto-advance"');
    expect(html).toContain('≫');
    expect(html).toContain('auto');
  });

  it('hides the auto-advance cell by default', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, status: 'running', tool: 'claude' }} />);
    expect(html).not.toContain('title="auto-advance"');
  });

  it('shows the elapsed time lapse in the footer', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', elapsed: '11m40s' }} />,
    );
    expect(html).toContain('11m40s');
  });
});

describe('KanbanCard workflow steps bar', () => {
  it('renders a segmented bar with the current stage label highlighted', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', stage: 'implement', stages: ['plan', 'implement', 'review'] }} />,
    );
    expect(html).toContain('▰');
    expect(html).toContain('▱');
    expect(html).toContain('implement');
    expect(html).toContain('(2/3)');
  });

  it('renders every segment pending when status is todo', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'todo', stage: 'implement', stages: ['plan', 'implement', 'review'] }} />,
    );
    expect(html).not.toContain('▰');
    expect(html).toContain('todo');
    expect(html).toContain('(0/3)');
  });

  it('renders without a steps bar when stages is absent or empty', () => {
    const noStages = renderToStaticMarkup(<KanbanCard run={{ ...run, status: 'running', stage: 'implement' }} />);
    const emptyStages = renderToStaticMarkup(<KanbanCard run={{ ...run, status: 'running', stage: 'implement', stages: [] }} />);
    expect(noStages).not.toContain('▱');
    expect(emptyStages).not.toContain('▱');
  });

  it('keeps every segment pending when the stage is not found in stages', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', stage: 'unknown', stages: ['plan', 'implement', 'review'] }} />,
    );
    expect(html).not.toContain('▰');
    expect(html).toContain('unknown');
  });

  it('renders one segment per stage for long workflows without truncation', () => {
    const stages = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', stage: 'd', stages }} />,
    );
    const segments = (html.match(/[▰▱]/g) ?? []).length;
    expect(segments).toBe(stages.length);
    expect(html).toContain('(4/8)');
  });
});

describe('KanbanCard done state', () => {
  it('differentiates done cards with an accent border and PR link instead of the steps bar', () => {
    const html = renderToStaticMarkup(
      <KanbanCard
        run={{ ...run, status: 'done', stages: ['plan', 'implement'], prUrl: 'https://github.com/x/y/pull/123', prNumber: 123 }}
      />,
    );
    expect(html).toContain('var(--accent-ok)');
    expect(html).toContain('https://github.com/x/y/pull/123');
    expect(html).toContain('PR #123');
    expect(html).not.toContain('▰');
  });

  it('falls back to a fully-complete steps bar when done without a PR url', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'done', stage: 'plan', stages: ['plan', 'implement'] }} />,
    );
    expect(html).toContain('(2/2)');
    expect(html).not.toContain('▱');
  });
});
