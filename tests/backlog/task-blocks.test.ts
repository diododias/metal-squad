import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTEXT_WINDOW,
  SESSION_BUDGET_RATIO,
  estimateTaskTokens,
  estimateTokens,
  planFeatureTaskBlocks,
  planTaskBlocks,
  resolveContextWindow,
} from '../../src/core/tasks/blocks.js';
import type { BlockTask } from '../../src/core/tasks/blocks.js';

function tasks(...specs: Array<[string, number]>): BlockTask[] {
  return specs.map(([id, estimatedTokens]) => ({ id, title: id, estimatedTokens }));
}

describe('estimateTokens', () => {
  it('uses ~4 chars per token and rounds up', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('resolveContextWindow', () => {
  it('matches a known model exactly', () => {
    expect(resolveContextWindow({ model: 'opus' })).toBe(200_000);
  });

  it('matches a versioned model by substring', () => {
    expect(resolveContextWindow({ model: 'claude-opus-4-8' })).toBe(200_000);
    expect(resolveContextWindow({ model: 'gpt-5-mini' })).toBe(256_000);
  });

  it('falls back to the tool window, then the default', () => {
    expect(resolveContextWindow({ tool: 'opencode' })).toBe(128_000);
    expect(resolveContextWindow({})).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});

describe('planTaskBlocks', () => {
  it('packs tasks into blocks that fit the 70% budget, preserving order', () => {
    // contextWindow 1000, ratio 0.7 → budget 700.
    const plan = planTaskBlocks(tasks(['A', 300], ['B', 300], ['C', 300], ['D', 100]), {
      contextWindow: 1000,
      budgetRatio: 0.7,
    });

    expect(plan.budgetTokens).toBe(700);
    // A+B = 600 fit; C would make 900 > 700 → new block C+D = 400.
    expect(plan.blocks.map((b) => b.tasks.map((t) => t.id))).toEqual([['A', 'B'], ['C', 'D']]);
    expect(plan.blocks[0]?.totalTokens).toBe(600);
    expect(plan.blocks[1]?.totalTokens).toBe(400);
    expect(plan.totalTasks).toBe(4);
    expect(plan.totalTokens).toBe(1000);
    expect(plan.oversizedTasks).toEqual([]);
  });

  it('isolates a task larger than the budget and flags it oversized', () => {
    const plan = planTaskBlocks(tasks(['A', 100], ['BIG', 900], ['C', 100]), {
      contextWindow: 1000,
      budgetRatio: 0.7,
    });

    expect(plan.oversizedTasks).toEqual(['BIG']);
    expect(plan.blocks.map((b) => b.tasks.map((t) => t.id))).toEqual([['A'], ['BIG'], ['C']]);
  });

  it('defaults to the 70% session ratio and default context window', () => {
    const plan = planTaskBlocks(tasks(['A', 10]));
    expect(plan.budgetRatio).toBe(SESSION_BUDGET_RATIO);
    expect(plan.budgetTokens).toBe(Math.round(DEFAULT_CONTEXT_WINDOW * SESSION_BUDGET_RATIO));
  });

  it('returns an empty plan for no tasks', () => {
    const plan = planTaskBlocks([]);
    expect(plan.blocks).toEqual([]);
    expect(plan.totalTasks).toBe(0);
    expect(plan.totalTokens).toBe(0);
  });
});

describe('estimateTaskTokens', () => {
  it('includes a base cost plus title/body estimate', () => {
    expect(estimateTaskTokens({ title: 'abcd' }, 1000)).toBe(1001);
    expect(estimateTaskTokens({ title: 'abcd', body: 'abcd' }, 1000)).toBe(1002);
  });
});

describe('planFeatureTaskBlocks', () => {
  it('resolves the window from the feature model and estimates each task', () => {
    const plan = planFeatureTaskBlocks(
      {
        model: 'opus',
        tool: 'claude',
        tasks: [
          { id: 'T1', title: 'x', status: 'todo', dependsOn: [] },
          { id: 'T2', title: 'y', status: 'todo', dependsOn: [] },
        ],
      },
      { baseTokensPerTask: 1000 },
    );

    expect(plan.contextWindow).toBe(200_000);
    expect(plan.totalTasks).toBe(2);
    expect(plan.blocks[0]?.tasks[0]?.estimatedTokens).toBe(1000 + 1); // base + estimate('x')
  });
});
