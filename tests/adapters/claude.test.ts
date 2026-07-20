import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCli = vi.fn();
const mockExecFileSync = vi.fn();
const mockEventEmit = vi.fn();
const mockResolveToolInvocation = vi.fn(() => ({
  command: 'claude', baseArgs: [], env: {}, versionCheck: ['--version'],
  capabilities: { model: true, effort: false, thinking: true },
  thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 1_800_000,
}));

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: () => ({ toolTimeoutMs: 600_000, heartbeatMs: 30_000 }),
}));

vi.mock('../../src/core/adapters/spawn.js', () => ({
  runCli: mockRunCli,
  resolveToolInvocation: mockResolveToolInvocation,
}));

vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: { emit: mockEventEmit },
  logCaughtError: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

const feature = {
  id: 'feat-1',
  title: 'Test Feature',
  tool: 'claude' as const,
  effort: 'medium' as const,
  dependsOn: [],
  tasks: [],
};

beforeEach(() => {
  mockRunCli.mockReset();
  mockExecFileSync.mockReset();
  mockEventEmit.mockReset();
});

describe('claudeAdapter.runFeature — session limit false positive (H-session-limit-false-positive)', () => {
  it('does not block a run whose transcript merely mentions "session limit" in tool output but closes with a valid MSQ_DONE', async () => {
    const transcript = [
      JSON.stringify({
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: 'commit 0767d46 feat(notify): suggest and enable adapter fallback resume on Telegram session limit (#218)',
          }],
        },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: 'All good. MSQ_DONE: Implemented and validated.\npr_url=https://github.com/org/repo/pull/1 pr_number=1 base=develop head=feat/x',
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ].join('\n');
    mockRunCli.mockResolvedValue({ code: 0, stdout: transcript, stderr: '' });

    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');
    const result = await claudeAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 1 });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBeUndefined();
    expect(result.control).toEqual(expect.objectContaining({
      type: 'done',
      publication: expect.objectContaining({ prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 }),
    }));
  });

  it('still reports a blocked run when the transcript has no MSQ_DONE/control signal and genuinely mentions a rate limit', async () => {
    const transcript = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hit a provider error while working.' }] },
    });
    mockRunCli.mockResolvedValue({ code: 0, stdout: transcript, stderr: 'Error: rate limit exceeded, please retry later' });

    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');
    const result = await claudeAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 2 });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain('session limit reached');
  });
});
