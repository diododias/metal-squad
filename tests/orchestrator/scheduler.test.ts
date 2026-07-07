import { describe, expect, it } from 'vitest';
import { schedule } from '../../src/core/orchestrator/scheduler.js';
import type { Feature } from '../../src/core/backlog/schema.js';

function feature(id: string, dependsOn: string[] = []): Feature {
  return {
    id,
    title: id,
    tool: 'claude',
    effort: 'medium',
    dependsOn,
    tasks: [],
  };
}

describe('schedule', () => {
  it('rejects explicit deadlocks caused by unsatisfied dependencies', async () => {
    await expect(
      schedule([feature('feat-03', ['feat-02'])], {
        concurrency: 1,
        execute: async () => ({ ok: true, summary: 'done' }),
      }),
    ).rejects.toThrow(
      'Deadlock: no executable features are ready. Unsatisfied dependencies: feat-03 -> [feat-02]',
    );
  });

  it('runs ready dependencies before the requested feature', async () => {
    const executed: string[] = [];

    await schedule([feature('feat-01'), feature('feat-02', ['feat-01'])], {
      concurrency: 1,
      execute: async (item) => {
        executed.push(item.id);
        return { ok: true, summary: item.id };
      },
    });

    expect(executed).toEqual(['feat-01', 'feat-02']);
  });

  it('continues dependents when a failed feature uses onFail continue', async () => {
    const executed: string[] = [];

    await schedule(
      [
        { ...feature('feat-01'), retry: { maxAttempts: 1, backoffMs: 0, onFail: 'continue' } },
        feature('feat-02', ['feat-01']),
      ],
      {
        concurrency: 1,
        execute: async (item) => {
          executed.push(item.id);
          if (item.id === 'feat-01') return { ok: false, summary: 'falhou mas segue' };
          return { ok: true, summary: item.id };
        },
      },
    );

    expect(executed).toEqual(['feat-01', 'feat-02']);
  });
});
