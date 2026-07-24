import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { KanbanCard, toShortFeatureId, toShortModelLabel } from '../../src/web/client/components/data/KanbanCard.js';
import { shortId } from '../../src/web/client/lib/entityId.js';
import type { KanbanCardProps } from '../../src/web/client/components/data/KanbanCard.js';

const run = {
  featureId: 'feat-52',
  title: 'Legacy feature',
  status: 'done' as const,
};

describe('KanbanCard entity identity', () => {
  it('renders the canonical feature ID instead of a legacy persisted format', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, persistedId: 'F-23456789' }} />);
    expect(html).toContain(shortId('work_item', run.featureId));
    expect(html).not.toContain('F-23456789');
  });

  it('uses the short hash only as a display fallback', () => {
    const html = renderToStaticMarkup(<KanbanCard run={run} />);
    expect(html).toContain(toShortFeatureId(run.featureId));
  });

  it('shows the title on top with the muted epic and feature id below it', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, persistedId: 'F-23456789', epicTitle: 'Web Dashboard' }} />,
    );
    expect(html).toContain('Web Dashboard');
    expect(html).toContain(shortId('work_item', run.featureId));
    expect(html.indexOf('Legacy feature')).toBeLessThan(html.indexOf('Web Dashboard'));
    expect(html.indexOf('Web Dashboard')).toBeLessThan(html.indexOf(shortId('work_item', run.featureId)));
  });

  it('keeps the feature id in the markup even when the epic title is long', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, persistedId: 'SET-44', epicTitle: 'Settings — M9 (Consolidacao, limpeza e docs finais do modulo)' }} />,
    );
    expect(html).toContain(shortId('work_item', run.featureId));
  });

  it('uses a B prefix for bugs without changing persisted data', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, persistedId: 'F-23456789', workItemType: 'bug' }} />);
    expect(html).toContain(shortId('work_item', run.featureId, 'bug'));
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

  it('labels tokens from an aborted run as waste', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'aborted', tokens: 1_000, wasteTokens: 1_000 }} />,
    );
    expect(html).toContain('1k tok · WASTE');
    expect(html).toContain('var(--accent-warn)');
  });

  it('renders a paused pipeline as blocked instead of running', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', pipelineStatus: 'paused' }} />,
    );
    expect(html).toContain('⊘ blocked');
    expect(html).not.toContain('msq-status-spinner');
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

  it('shows a running workflow without a persisted stage as starting at zero progress', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', stages: ['implement'] }} />,
    );
    expect(html).toContain('starting');
    expect(html).toContain('(0/1)');
    expect(html).not.toContain('complete');
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

describe('KanbanCard Project scope (repo, type, health)', () => {
  it('renders the type badge when workItemType is present', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, workItemType: 'bug' }} />);
    expect(html).toContain('title="type: bug"');
    expect(html).toContain('bug');
  });

  it('omits the type badge when workItemType is absent', () => {
    const html = renderToStaticMarkup(<KanbanCard run={run} />);
    expect(html).not.toContain('title="type:');
  });

  it('renders the template/version badge when templateId is present', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, templateId: 'tmpl-feature', templateVersion: 3 }} />);
    expect(html).toContain('title="workflow template: tmpl-feature v3"');
    expect(html).toContain('tmpl-feature');
    expect(html).toContain('v3');
  });

  it('omits the template/version badge when templateId is absent', () => {
    const html = renderToStaticMarkup(<KanbanCard run={run} />);
    expect(html).not.toContain('title="workflow template:');
  });

  it('shows the repo cell in the tool rail only when repoLabel is provided', () => {
    const withRepo = renderToStaticMarkup(<KanbanCard run={{ ...run, repoLabel: 'repo-one' }} />);
    expect(withRepo).toContain('title="repository: repo-one"');
    expect(withRepo).toContain('repo-one');

    const withoutRepo = renderToStaticMarkup(<KanbanCard run={run} />);
    expect(withoutRepo).not.toContain('title="repository:');
  });

  it('warns that an unhealthy repository blocks starting the item', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, repoUnhealthy: true }} />);
    expect(html).toContain('title="Repository unavailable"');
    expect(html).toContain('repository unavailable — cannot start');
  });

  it('omits the health warning when the repository is healthy or unchecked', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, repoUnhealthy: false }} />);
    expect(html).not.toContain('repository unavailable');
  });
});

function makeLifecycle(
  overrides: Partial<KanbanCardProps['lifecycle']> = {},
): NonNullable<KanbanCardProps['lifecycle']> {
  return {
    allowed: undefined,
    revision: 1,
    send: vi.fn(),
    actionResults: {},
    eligibility: { canStart: true, reason: null, blockedByDependencies: [], repoUnhealthy: false },
    onStart: vi.fn(),
    ...overrides,
  };
}

describe('KanbanCard Start/Resume actions (SC-001, SC-002)', () => {
  it('renders a Start button for a TODO card with lifecycle (SC-001)', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'todo' }} lifecycle={makeLifecycle()} />,
    );
    expect(html).toContain('Start');
  });

  it('disables Start when eligibility.canStart is false', () => {
    const html = renderToStaticMarkup(
      <KanbanCard
        run={{ ...run, status: 'todo' }}
        lifecycle={makeLifecycle({
          eligibility: { canStart: false, reason: 'Pending dependencies: dep-1', blockedByDependencies: ['dep-1'], repoUnhealthy: false },
        })}
      />,
    );
    expect(html).toContain('Start');
    expect(html).toContain('Pending dependencies');
  });

  it('renders a Resume button for a BLOCKED card with a live pipeline (SC-002)', () => {
    const html = renderToStaticMarkup(
      <KanbanCard
        run={{ ...run, status: 'running', pipelineStatus: 'paused', pipelineId: 42 }}
        lifecycle={makeLifecycle()}
      />,
    );
    expect(html).toContain('Resume');
  });

  it('omits Start/Resume when no lifecycle prop is provided', () => {
    const todoHtml = renderToStaticMarkup(<KanbanCard run={{ ...run, status: 'todo' }} />);
    expect(todoHtml).not.toContain('>Start<');
    const blockedHtml = renderToStaticMarkup(<KanbanCard run={{ ...run, status: 'running', pipelineStatus: 'paused', pipelineId: 99 }} />);
    expect(blockedHtml).not.toContain('>Resume<');
  });
});

describe('KanbanCard dependency indicator (SC-003)', () => {
  it('shows deps-ok badge when all dependencies are completed', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'todo' }} lifecycle={makeLifecycle()} />,
    );
    expect(html).toContain('deps ok');
    expect(html).toContain('All dependencies completed');
  });

  it('shows blocked-deps badge with count when dependencies are pending', () => {
    const html = renderToStaticMarkup(
      <KanbanCard
        run={{ ...run, status: 'todo' }}
        lifecycle={makeLifecycle({
          eligibility: { canStart: false, reason: 'Pending dependencies: dep-a, dep-b', blockedByDependencies: ['dep-a', 'dep-b'], repoUnhealthy: false },
        })}
      />,
    );
    expect(html).toContain('deps 2');
    expect(html).toContain('dep-a, dep-b');
  });

  it('omits the deps indicator when lifecycle is absent', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, status: 'todo' }} />);
    expect(html).not.toContain('deps ok');
    expect(html).not.toContain('deps ');
  });
});

describe('KanbanCard auto-start cell (SC-003)', () => {
  it('renders auto-start cell in the tool rail when autoStart is true', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'todo', tool: 'claude', autoStart: true }} />,
    );
    expect(html).toContain('title="auto-start"');
    expect(html).toContain('auto start');
  });

  it('renders both auto-advance and auto-start cells when both flags are set', () => {
    const html = renderToStaticMarkup(
      <KanbanCard run={{ ...run, status: 'running', tool: 'claude', autoAdvance: true, autoStart: true }} />,
    );
    expect(html).toContain('title="auto-advance"');
    expect(html).toContain('title="auto-start"');
  });

  it('hides auto-start cell by default', () => {
    const html = renderToStaticMarkup(<KanbanCard run={{ ...run, status: 'todo', tool: 'claude' }} />);
    expect(html).not.toContain('title="auto-start"');
  });
});
