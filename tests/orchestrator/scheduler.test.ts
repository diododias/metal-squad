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
      }).result,
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
    }).result;

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
    ).result;

    expect(executed).toEqual(['feat-01', 'feat-02']);
  });

  it('pauses instead of finishing when a failed feature uses onFail gate, resuming re-attempts it', async () => {
    const executed: string[] = [];
    let feat01Attempts = 0;

    const controller = schedule(
      [
        { ...feature('feat-01'), retry: { maxAttempts: 1, backoffMs: 0, onFail: 'gate' } },
        feature('feat-02', ['feat-01']),
      ],
      {
        concurrency: 1,
        execute: async (item) => {
          executed.push(item.id);
          if (item.id === 'feat-01') {
            feat01Attempts += 1;
            if (feat01Attempts === 1) return { ok: false, summary: 'gate decision needed' };
            return { ok: true, summary: 'resolved after gate' };
          }
          return { ok: true, summary: item.id };
        },
      },
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getState()).toBe('paused');
    expect(executed).toEqual(['feat-01']);

    controller.resume();
    await controller.result;

    expect(executed).toEqual(['feat-01', 'feat-01', 'feat-02']);
  });

  it('pauses new dispatches while letting the active feature finish, then resumes', async () => {
    let releaseFirst!: () => void;
    const executed: string[] = [];
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const controller = schedule([feature('feat-01'), feature('feat-02')], {
      concurrency: 1,
      execute: async (item) => {
        executed.push(item.id);
        if (item.id === 'feat-01') {
          await firstDone;
        }
        return { ok: true, summary: item.id };
      },
    });

    await Promise.resolve();
    controller.pause();
    await Promise.resolve();
    expect(executed).toEqual(['feat-01']);

    releaseFirst();
    await Promise.resolve();
    expect(executed).toEqual(['feat-01']);

    controller.resume();
    await controller.result;
    expect(executed).toEqual(['feat-01', 'feat-02']);
  });

  it('aborts only the selected active feature and requeues it for resume', async () => {
    let attempts = 0;
    const aborted: string[] = [];
    const controller = schedule([feature('feat-01')], {
      concurrency: 1,
      onAbortFeature: (featureId) => {
        aborted.push(featureId);
      },
      execute: async () => {
        attempts += 1;
        return attempts === 1
          ? { ok: false, aborted: true, summary: 'aborted' }
          : { ok: true, summary: 'done' };
      },
    });

    await Promise.resolve();
    expect(controller.abortFeature('feat-01')).toBe(true);
    controller.pause();
    await Promise.resolve();
    expect(aborted).toEqual(['feat-01']);

    controller.resume();
    await controller.result;
    expect(attempts).toBe(2);
  });

  it('aborts the whole pipeline without dispatching new features', async () => {
    let releaseFirst!: () => void;
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const executed: string[] = [];
    const controller = schedule([feature('feat-01'), feature('feat-02')], {
      concurrency: 1,
      onAbortFeature: () => {
        releaseFirst();
      },
      execute: async (item) => {
        executed.push(item.id);
        if (item.id === 'feat-01') {
          await firstDone;
          return { ok: false, aborted: true, summary: 'aborted' };
        }
        return { ok: true, summary: item.id };
      },
    });

    await Promise.resolve();
    controller.abortAll();
    await expect(controller.result).resolves.toBe('aborted');
    expect(executed).toEqual(['feat-01']);
  });
});
