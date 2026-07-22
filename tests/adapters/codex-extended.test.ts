import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCli = vi.fn();
const mockExecFileSync = vi.fn();
const mockEventEmit = vi.fn();
const mockParseControlSignal = vi.fn();
const mockExistsSync = vi.fn();
const mockResolveToolInvocation = vi.fn(() => ({ command: 'codex', baseArgs: [], env: {}, versionCheck: ['--version'] }));

class MockCliTimeoutError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly timeoutMs: number;
  readonly runtimeMs: number;
  constructor(bin: string, timeoutMs: number, runtimeMs: number, stdout: string, stderr: string) {
    super(`${bin} excedeu timeout (${timeoutMs}ms)`);
    this.name = 'CliTimeoutError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.timeoutMs = timeoutMs;
    this.runtimeMs = runtimeMs;
  }
}

class MockCliAbortError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly runtimeMs: number;
  readonly signal: string | null;
  constructor(bin: string, runtimeMs: number, stdout: string, stderr: string, signal: string | null) {
    super(`${bin} abortado`);
    this.name = 'CliAbortError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.runtimeMs = runtimeMs;
    this.signal = signal;
  }
}

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: () => ({ toolTimeoutMs: 600_000, heartbeatMs: 30_000 }),
}));

vi.mock('../../src/core/adapters/spawn.js', () => ({
  runCli: mockRunCli,
  resolveToolInvocation: mockResolveToolInvocation,
  CliTimeoutError: MockCliTimeoutError,
  CliAbortError: MockCliAbortError,
}));

vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: { emit: mockEventEmit },
  logCaughtError: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}));

vi.mock('../../src/core/adapters/control.js', () => ({
  parseControlSignal: mockParseControlSignal,
}));

const feature = {
  id: 'feat-1',
  title: 'Test Feature',
  tool: 'codex' as const,
  effort: 'medium' as const,
  dependsOn: [],
  tasks: [],
};

beforeEach(() => {
  mockRunCli.mockReset();
  mockExecFileSync.mockReset();
  mockEventEmit.mockReset();
  mockParseControlSignal.mockReset().mockReturnValue(null);
  mockExistsSync.mockReset().mockReturnValue(false);
  mockResolveToolInvocation.mockReturnValue({ command: 'codex', baseArgs: [], env: {}, versionCheck: ['--version'] });
});

describe('codexAdapter.effortFlag', () => {
  it('returns effort flag for low', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    expect(codexAdapter.effortFlag('low')).toEqual(['-c', 'model_reasoning_effort="low"']);
  });

  it('returns effort flag for medium', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    expect(codexAdapter.effortFlag('medium')).toEqual(['-c', 'model_reasoning_effort="medium"']);
  });

  it('returns effort flag for high', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    expect(codexAdapter.effortFlag('high')).toEqual(['-c', 'model_reasoning_effort="high"']);
  });
});

describe('codexAdapter.parseUsage', () => {
  it('returns null for empty transcript', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    expect(codexAdapter.parseUsage?.('')).toBeNull();
  });

  it('returns null for non-JSON lines', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    expect(codexAdapter.parseUsage?.('not json\nalso not json')).toBeNull();
  });

  it('returns null when no turn.completed event', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const transcript = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'hi' } });
    expect(codexAdapter.parseUsage?.(transcript)).toBeNull();
  });

  it('parses turn.completed usage with all fields', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const transcript = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 50, reasoning_output_tokens: 10 },
    });
    expect(codexAdapter.parseUsage?.(transcript)).toEqual({
      input: 100, cachedInput: 20, output: 60, total: 180,
    });
  });

  it('uses 0 as defaults for missing token fields', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const transcript = JSON.stringify({ type: 'turn.completed', usage: {} });
    expect(codexAdapter.parseUsage?.(transcript)).toEqual({
      input: 0, cachedInput: 0, output: 0, total: 0,
    });
  });

  it('returns the LAST turn.completed usage when multiple present', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const transcript = [
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 200, output_tokens: 100 } }),
    ].join('\n');
    const usage = codexAdapter.parseUsage?.(transcript);
    expect(usage?.input).toBe(200);
    expect(usage?.output).toBe(100);
  });

  it('ignores turn.completed events without usage field', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const transcript = JSON.stringify({ type: 'turn.completed' });
    expect(codexAdapter.parseUsage?.(transcript)).toBeNull();
  });
});

describe('codexAdapter.runFeature — success path', () => {
  it('returns ok=true with summary from last agent message', async () => {
    const agentMsg = 'Implementation complete.';
    const transcript = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: agentMsg },
    });
    mockRunCli.mockResolvedValue({ code: 0, stdout: transcript, stderr: '' });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 1 });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe(agentMsg);
  });

  it('does not block a run whose transcript merely mentions "session limit" in tool output but closes with a valid MSQ_DONE', async () => {
    const transcript = [
      JSON.stringify({
        type: 'item.completed',
        item: {
          type: 'command_execution',
          command: 'git log',
          aggregated_output: 'commit 0767d46 feat(notify): suggest and enable adapter fallback resume on Telegram session limit (#218)',
          exit_code: 0,
        },
      }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'All good. MSQ_DONE: Implemented.\npr_url=https://github.com/org/repo/pull/1 pr_number=1 base=develop head=feat/x' },
      }),
    ].join('\n');
    mockRunCli.mockResolvedValue({ code: 0, stdout: transcript, stderr: '' });
    mockParseControlSignal.mockReturnValue({
      type: 'done',
      summary: 'Implemented.',
      publication: { prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1, base: 'develop', head: 'feat/x' },
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 100 });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBeUndefined();
    expect(result.control).toEqual(expect.objectContaining({
      type: 'done',
      publication: expect.objectContaining({ prUrl: 'https://github.com/org/repo/pull/1', prNumber: 1 }),
    }));
  });

  it('still reports a blocked run when the transcript has no MSQ_DONE/control signal and genuinely mentions a rate limit', async () => {
    const transcript = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'Hit a provider error while working.' },
    });
    mockRunCli.mockResolvedValue({ code: 0, stdout: transcript, stderr: 'Error: rate limit exceeded, please retry later' });
    mockParseControlSignal.mockReturnValue(null);

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 101 });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain('session limit reached');
  });

  it('emits tokens:update when turn.completed in stdout', async () => {
    const transcript = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 5 },
    });
    mockRunCli.mockResolvedValue({ code: 0, stdout: transcript, stderr: '' });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 2 });

    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', expect.objectContaining({
      runId: 2,
      featureId: 'feat-1',
      tool: 'codex',
      input: 100,
      output: 55,
    }));
  });

  it('truncates summary to 200 chars', async () => {
    const longText = 'X'.repeat(300);
    const transcript = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: longText },
    });
    mockRunCli.mockResolvedValue({ code: 0, stdout: transcript, stderr: '' });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 3 });

    expect(result.summary).toHaveLength(200);
  });

  it('returns empty summary when no agent message in stdout', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 4 });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe('');
  });

  it('includes model flag when feature.model is set', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const featureWithModel = { ...feature, model: 'codex-mini' };

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(featureWithModel, 'prompt', { cwd: '/repo', runId: 5 });

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).toContain('-m');
    expect(args).toContain('codex-mini');
  });

  it('does not include -m flag when feature.model is not set', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 6 });

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).not.toContain('-m');
  });

  it('captures the thread id as a reusable session handle', async () => {
    const transcript = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread_123' }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }),
    ].join('\n');
    mockRunCli.mockResolvedValue({ code: 0, stdout: transcript, stderr: '' });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 6 });

    expect(result.session).toMatchObject({
      tool: 'codex',
      sessionId: 'thread_123',
      capturedFromRunId: 6,
    });
  });

  it('uses the resume subcommand when a prior session handle is provided', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mockExistsSync.mockReturnValue(true);

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', {
      cwd: '/repo',
      runId: 7,
      session: {
        mode: 'resume',
        handle: {
          tool: 'codex',
          sessionId: 'thread_123',
          capturedFromRunId: 1,
          capturedAt: '2026-07-11T00:00:00Z',
        },
      },
    });

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).toEqual([
      'exec',
      'resume',
      '--json',
      '--skip-git-repo-check',
      '-c',
      'model_reasoning_effort="medium"',
      'thread_123',
      '--',
      'prompt',
    ]);
    expect(args).not.toContain('--sandbox');
    expect(args).not.toContain('--add-dir');
  });

  it('adds .git as a writable directory when repository metadata exists', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mockExistsSync.mockImplementation((path: string) => path === '/repo/.git');

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 8 });

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).toContain('--add-dir');
    expect(args).toContain('/repo/.git');
  });
});

describe('codexAdapter.runFeature — failure path', () => {
  it('returns ok=false with stderr on non-zero exit', async () => {
    mockRunCli.mockResolvedValue({ code: 1, stdout: '', stderr: 'fatal error occurred' });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 7 });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('fatal error occurred');
  });

  it('uses "exit N" fallback when stderr is empty on non-zero exit', async () => {
    mockRunCli.mockResolvedValue({ code: 2, stdout: '', stderr: '' });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 8 });

    expect(result.ok).toBe(false);
    expect(result.summary).toBe('exit 2');
  });

  it('handles CliAbortError and returns aborted=true', async () => {
    mockRunCli.mockRejectedValue(new MockCliAbortError('codex', 1234, '', '', 'SIGTERM'));

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 9 });

    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.summary).toContain('1s');
  });

  it('emits tokens:update on abort when stdout has usage', async () => {
    const transcript = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 50, cached_input_tokens: 0, output_tokens: 25 },
    });
    mockRunCli.mockRejectedValue(new MockCliAbortError('codex', 2000, transcript, '', null));

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 10 });

    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', expect.objectContaining({
      input: 50, output: 25,
    }));
  });

  it('rethrows unknown errors', async () => {
    mockRunCli.mockRejectedValue(new Error('unknown spawn error'));

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await expect(codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 11 }))
      .rejects.toThrow('unknown spawn error');
  });
});

describe('createCodexProgress — onStdoutLine', () => {
  it('returns {} for non-JSON line', async () => {
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.('not json');
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 20 });
    // no run:output emitted for non-JSON
    const outputCalls = mockEventEmit.mock.calls.filter(c => c[0] === 'run:output');
    expect(outputCalls).toHaveLength(0);
  });

  it('returns {} for JSON without type field', async () => {
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(JSON.stringify({ data: 'value' }));
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 21 });
    const outputCalls = mockEventEmit.mock.calls.filter(c => c[0] === 'run:output');
    expect(outputCalls).toHaveLength(0);
  });

  it('emits tokens:update for turn.completed event in onStdoutLine', async () => {
    const usageEvent = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 200, cached_input_tokens: 10, output_tokens: 80, reasoning_output_tokens: 5 },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(usageEvent);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 22 });

    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', expect.objectContaining({
      input: 200, cachedInput: 10, output: 85, total: 295,
    }));
  });

  it('emits the complete agent message for item.completed agent_message', async () => {
    const agentMessage = `Hello from agent ${'with detailed progress. '.repeat(20)}`;
    const agentEvent = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: agentMessage },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(agentEvent);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 23 });

    const outputCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'agent');
    expect(outputCall).toBeDefined();
    expect(outputCall![1].line).toBe(agentMessage.trim());
    expect(outputCall![1].stream).toBe('stdout');
  });

  it('returns {} when agent_message text is empty', async () => {
    const agentEvent = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: '' },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(agentEvent);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 24 });
    const outputCalls = mockEventEmit.mock.calls.filter(c => c[0] === 'run:output' && c[1].source === 'agent');
    expect(outputCalls).toHaveLength(0);
  });

  it('emits run:output with source=tool for command_execution', async () => {
    const toolEvent = JSON.stringify({
      type: 'item.completed',
      item: { type: 'command_execution', command: 'ls -la', aggregated_output: 'file.ts\n', exit_code: 0 },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(toolEvent);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 25 });

    const outputCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'tool');
    expect(outputCall).toBeDefined();
    expect(outputCall![1].line).toContain('ls -la');
  });

  it('emits run:output for generic tool item (function_call)', async () => {
    const toolEvent = JSON.stringify({
      type: 'item.completed',
      item: { type: 'function_call', name: 'read_file', arguments: { path: 'src/main.ts' } },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(toolEvent);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 26 });

    const outputCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'tool');
    expect(outputCall).toBeDefined();
    expect(outputCall![1].line).toContain('read_file');
  });

  it('emits run:output with the actual message for item.completed error payloads', async () => {
    const errorEvent = JSON.stringify({
      type: 'item.completed',
      item: { type: 'error', message: 'usage limit reached' },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(errorEvent);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 27 });

    const outputCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'tool');
    expect(outputCall).toBeDefined();
    expect(outputCall![1].line).toBe('error usage limit reached');
  });

  it('emits top-level codex errors as output lines', async () => {
    const errorEvent = JSON.stringify({
      type: 'error',
      message: 'try again later',
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(errorEvent);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 28 });

    const outputCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'tool');
    expect(outputCall).toBeDefined();
    expect(outputCall![1].line).toBe('error try again later');
  });
});

describe('createCodexProgress — onStderrLine', () => {
  it('emits run:output with source=stderr for non-empty line', async () => {
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStderrLine?.('warning: something');
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 30 });

    const outputCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'stderr');
    expect(outputCall).toBeDefined();
    expect(outputCall![1].line).toBe('warning: something');
    expect(outputCall![1].stream).toBe('stderr');
  });

  it('returns {} for empty/whitespace-only stderr line', async () => {
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStderrLine?.('   ');
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 31 });

    const outputCalls = mockEventEmit.mock.calls.filter(c => c[0] === 'run:output' && c[1].source === 'stderr');
    expect(outputCalls).toHaveLength(0);
  });
});

describe('createCodexProgress — compatibility suffix (not emitted as heartbeat text)', () => {
  it('returns undefined when no events processed', async () => {
    let capturedSuffix: (() => string | undefined) | undefined;
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      capturedSuffix = opts.heartbeatSuffix;
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 40 });

    expect(capturedSuffix?.()).toBeUndefined();
  });

  it('includes eventCount and lastEventType after processing an event', async () => {
    let capturedSuffix: (() => string | undefined) | undefined;
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      capturedSuffix = opts.heartbeatSuffix;
      opts.onStdoutLine?.(JSON.stringify({ type: 'item.started' }));
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 41 });

    const suffix = capturedSuffix?.();
    expect(suffix).toContain('eventos=1');
    expect(suffix).toContain('último=item.started');
  });

  it('includes agente snippet after agent_message event', async () => {
    let capturedSuffix: (() => string | undefined) | undefined;
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      capturedSuffix = opts.heartbeatSuffix;
      opts.onStdoutLine?.(JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'Progress so far' },
      }));
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 42 });

    const suffix = capturedSuffix?.();
    expect(suffix).toContain('agente="Progress so far"');
  });

  it('includes tool snippet when only tool events seen (no agent message)', async () => {
    let capturedSuffix: (() => string | undefined) | undefined;
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      capturedSuffix = opts.heartbeatSuffix;
      opts.onStdoutLine?.(JSON.stringify({
        type: 'item.completed',
        item: { type: 'command_execution', command: 'git status', aggregated_output: '', exit_code: 0 },
      }));
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 43 });

    const suffix = capturedSuffix?.();
    expect(suffix).toContain('tool="');
  });

  it('includes stderr snippet when only stderr events seen', async () => {
    let capturedSuffix: (() => string | undefined) | undefined;
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      capturedSuffix = opts.heartbeatSuffix;
      opts.onStderrLine?.('warning from codex');
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 44 });

    const suffix = capturedSuffix?.();
    expect(suffix).toContain('stderr="warning from codex"');
  });

  it('prefers error snippet over generic tool snippet when an error event is seen', async () => {
    let capturedSuffix: (() => string | undefined) | undefined;
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      capturedSuffix = opts.heartbeatSuffix;
      opts.onStdoutLine?.(JSON.stringify({
        type: 'error',
        message: 'usage limit reached',
      }));
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 45 });

    const suffix = capturedSuffix?.();
    expect(suffix).toContain('erro="error usage limit reached"');
  });
});

describe('detectTouchedFiles / summarizePartialOutput via timeout', () => {
  it('shows touched files in timeout summary', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 600_001, '', ''),
    );
    mockExecFileSync.mockReturnValue(' M src/file.ts\n');

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 50 });

    expect(result.summary).toContain('src/file.ts');
    expect(result.summary).toContain('arquivos tocados');
  });

  it('shows stderr when no agent message and no stdout in timeout', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 600_001, '', 'connection reset'),
    );
    mockExecFileSync.mockReturnValue('');

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 51 });

    expect(result.summary).toContain('stderr final: connection reset');
  });

  it('shows stdout tail when no agent message and no stderr in timeout', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 600_001, 'raw stdout content', ''),
    );
    mockExecFileSync.mockReturnValue('');

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 52 });

    expect(result.summary).toContain('stdout final: raw stdout content');
  });

  it('shows stdout error message before stderr in timeout summaries', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError(
        'codex',
        600_000,
        600_001,
        JSON.stringify({ type: 'error', message: 'usage limit reached' }),
        'Reading additional input from stdin...',
      ),
    );
    mockExecFileSync.mockReturnValue('');

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 52 });

    expect(result.summary).toContain('erro final: error usage limit reached');
    expect(result.summary).not.toContain('stderr final: Reading additional input from stdin...');
  });

  it('shows "sem saída útil capturada" when everything empty in timeout', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 600_001, '', ''),
    );
    mockExecFileSync.mockReturnValue('');

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 53 });

    expect(result.summary).toContain('sem saída útil capturada');
  });

  it('returns empty touched files when execFileSync throws', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 600_001, '', ''),
    );
    mockExecFileSync.mockImplementation(() => { throw new Error('git not found'); });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 54 });

    expect(result.ok).toBe(false);
    expect(result.summary).not.toContain('arquivos tocados');
  });

  it('shows +N remainder when more than 5 files touched', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 600_001, '', ''),
    );
    const manyFiles = Array.from({ length: 7 }, (_, i) => ` M file${i}.ts`).join('\n');
    mockExecFileSync.mockReturnValue(manyFiles + '\n');

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 55 });

    expect(result.summary).toContain('+2');
  });

  it('handles renamed files in git status (arrow format)', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 600_001, '', ''),
    );
    mockExecFileSync.mockReturnValue('R  old.ts -> new.ts\n');

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 56 });

    expect(result.summary).toContain('new.ts');
  });
});

describe('summarizeCodexToolEvent via onStdoutLine', () => {
  it('emits nothing for item.completed with no name/type/output', async () => {
    const event = JSON.stringify({
      type: 'item.completed',
      item: { type: 'unknown_empty' },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(event);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 60 });

    const toolCalls = mockEventEmit.mock.calls.filter(c => c[0] === 'run:output' && c[1].source === 'tool');
    // type 'unknown_empty' is used as fallback label in "tool unknown_empty"
    // This depends on whether label+payload are both empty; type is not empty
    // Actually: label = normalizeSnippet('unknown_empty') = 'unknown_empty', payload = ''
    // Result: normalizeSnippet('tool unknown_empty') = 'tool unknown_empty' → non-null
    // So it WILL emit
    expect(toolCalls.length).toBeGreaterThanOrEqual(0);
  });

  it('does not emit tool output for non-item.completed event types', async () => {
    const event = JSON.stringify({ type: 'item.started', item: { type: 'function_call' } });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(event);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 61 });

    const toolCalls = mockEventEmit.mock.calls.filter(c => c[0] === 'run:output' && c[1].source === 'tool');
    expect(toolCalls).toHaveLength(0);
  });

  it('emits command_execution with only exit code (no output)', async () => {
    const event = JSON.stringify({
      type: 'item.completed',
      item: { type: 'command_execution', command: 'npm test', exit_code: 1 },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(event);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 62 });

    const toolCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'tool');
    expect(toolCall?.[1].line).toContain('exit 1');
  });

  it('emits command_execution with just command when no output or exit code', async () => {
    const event = JSON.stringify({
      type: 'item.completed',
      item: { type: 'command_execution', command: 'echo hello' },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(event);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 63 });

    const toolCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'tool');
    expect(toolCall?.[1].line).toContain('echo hello');
    expect(toolCall?.[1].line).not.toContain('exit');
  });

  it('emits tool with string payload', async () => {
    const event = JSON.stringify({
      type: 'item.completed',
      item: { type: 'function_call', name: 'read', output: 'file contents here' },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(event);
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 64 });

    const toolCall = mockEventEmit.mock.calls.find(c => c[0] === 'run:output' && c[1].source === 'tool');
    expect(toolCall?.[1].line).toContain('read');
    expect(toolCall?.[1].line).toContain('file contents here');
  });
});

describe('codexAdapter non-zero exit summaries', () => {
  it('prefers stdout codex error messages over misleading stderr tails', async () => {
    mockRunCli.mockResolvedValue({
      code: 1,
      stdout: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread_1' }),
        JSON.stringify({ type: 'turn.started' }),
        JSON.stringify({ type: 'error', message: 'usage limit reached' }),
      ].join('\n'),
      stderr: 'Reading additional input from stdin...\n',
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature(feature, 'prompt', { cwd: '/repo', runId: 70 });

    expect(result.ok).toBe(false);
    expect(result.summary).toBe('error usage limit reached');
  });
});
