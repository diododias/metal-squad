import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCli = vi.fn();
const mockExecFileSync = vi.fn();
const mockEventEmit = vi.fn();
const mockResolveToolInvocation = vi.fn(() => ({
  command: 'codex', baseArgs: [], env: {}, versionCheck: ['--version'],
  capabilities: { model: true, effort: true, thinking: false },
  thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 1_800_000,
}));

class MockCliTimeoutError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly timeoutMs: number;
  readonly runtimeMs: number;

  constructor(
    bin: string,
    timeoutMs: number,
    runtimeMs: number,
    stdout: string,
    stderr: string,
  ) {
    super(`${bin} excedeu timeout (${timeoutMs}ms)`);
    this.name = 'CliTimeoutError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.timeoutMs = timeoutMs;
    this.runtimeMs = runtimeMs;
  }
}

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: () => ({ toolTimeoutMs: 600_000, heartbeatMs: 30_000 }),
}));

vi.mock('../../src/core/adapters/spawn.js', () => ({
  runCli: mockRunCli,
  resolveToolInvocation: mockResolveToolInvocation,
  CliTimeoutError: MockCliTimeoutError,
}));

vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: {
    emit: mockEventEmit,
  },
  logCaughtError: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

beforeEach(() => {
  mockRunCli.mockReset();
  mockExecFileSync.mockReset();
  mockEventEmit.mockReset();
  mockResolveToolInvocation.mockReturnValue({
    command: 'codex', baseArgs: [], env: {}, versionCheck: ['--version'],
    capabilities: { model: true, effort: true, thinking: false },
    thinkingBudget: { low: 0, medium: 0, high: 0 }, minTimeoutMs: 1_800_000,
  });
});

describe('codexAdapter timeout observability', () => {
  it('returns timeout summary with last agent message, touched files and parsed usage', async () => {
    const transcript = [
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'Atualizando registry e testes agora.' },
      }),
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: 100,
          cached_input_tokens: 20,
          output_tokens: 30,
          reasoning_output_tokens: 10,
        },
      }),
    ].join('\n');

    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 605_000, transcript, ''),
    );
    mockExecFileSync.mockReturnValue(
      ' M src/core/skills/registry.ts\n?? tests/skills/registry.test.ts\n',
    );

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature({
      id: 'feat-02',
      title: 'Feature',
      tool: 'codex',
      effort: 'medium',
      dependsOn: [],
      tasks: [],
    }, 'prompt', { cwd: '/repo', runId: 7 });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('timeout após 605s');
    expect(result.summary).toContain('última mensagem do agente: Atualizando registry e testes agora.');
    expect(result.summary).toContain(
      'arquivos tocados: src/core/skills/registry.ts, tests/skills/registry.test.ts',
    );
    expect(result.usage).toMatchObject({ input: 80, cachedInput: 20, output: 40, total: 140 });
    expect(mockRunCli).toHaveBeenCalledWith(
      'codex',
      expect.any(Array),
      expect.objectContaining({
        cwd: '/repo',
        idleThresholdMs: undefined,
        onStatus: expect.any(Function),
        onStdoutLine: expect.any(Function),
        heartbeatSuffix: expect.any(Function),
      }),
    );
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', {
      runId: 7,
      featureId: 'feat-02',
      tool: 'codex',
      input: 80,
      cachedInput: 20,
      output: 40,
      total: 140,
    });
  });

  it('captures the thread id from the partial transcript on timeout so a later resume can continue it', async () => {
    const transcript = [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-timeout-1' }),
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'Ainda trabalhando...' },
      }),
    ].join('\n');

    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 605_000, transcript, ''),
    );

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature({
      id: 'feat-02',
      title: 'Feature',
      tool: 'codex',
      effort: 'medium',
      dependsOn: [],
      tasks: [],
    }, 'prompt', { cwd: '/repo', runId: 7 });

    expect(result.ok).toBe(false);
    expect(result.session).toEqual({
      tool: 'codex',
      sessionId: 'thread-timeout-1',
      capturedFromRunId: 7,
      capturedAt: expect.any(String),
    });
  });

  it('falls back to the already-resumed session id on timeout when the partial transcript has no thread id yet', async () => {
    mockRunCli.mockRejectedValue(
      new MockCliTimeoutError('codex', 600_000, 605_000, '', ''),
    );

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const result = await codexAdapter.runFeature({
      id: 'feat-02',
      title: 'Feature',
      tool: 'codex',
      effort: 'medium',
      dependsOn: [],
      tasks: [],
    }, 'prompt', {
      cwd: '/repo',
      runId: 7,
      session: {
        mode: 'resume',
        handle: { tool: 'codex', sessionId: 'thread-already-resumed', capturedFromRunId: 3, capturedAt: '2026-07-19T00:00:00Z' },
      },
    });

    expect(result.session?.sessionId).toBe('thread-already-resumed');
  });

  it('summarizes completed command executions instead of opaque item ids', async () => {
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(JSON.stringify({
        type: 'item.completed',
        item: {
          id: 'item_1',
          type: 'command_execution',
          command: '/bin/zsh -lc pwd',
          aggregated_output: '/repo\n',
          exit_code: 0,
          status: 'completed',
        },
      }));
      return {
        code: 0,
        stdout: JSON.stringify({
          type: 'item.completed',
          item: { id: 'item_2', type: 'agent_message', text: 'done' },
        }),
        stderr: '',
      };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature({
      id: 'feat-03',
      title: 'Feature',
      tool: 'codex',
      effort: 'medium',
      dependsOn: [],
      tasks: [],
    }, 'prompt', { cwd: '/repo', runId: 9 });

    expect(mockEventEmit).toHaveBeenCalledWith('run:output', {
      runId: 9,
      featureId: 'feat-03',
      tool: 'codex',
      line: 'shell /bin/zsh -lc pwd -> /repo',
      stream: 'stdout',
      source: 'tool',
      createdAt: expect.any(String),
      toolName: 'shell',
    });
  });

  it('reads thinking capability and minimum timeout from the registry invocation', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'done' },
      }),
      stderr: '',
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature({
      id: 'feat-04',
      title: 'Feature',
      tool: 'codex',
      effort: 'high',
      thinking: 'on',
      dependsOn: [],
      tasks: [],
    }, 'prompt', { cwd: '/repo', runId: 11 });

    expect(mockEventEmit).toHaveBeenCalledWith('run:output', expect.objectContaining({
      runId: 11,
      featureId: 'feat-04',
      tool: 'codex',
      line: 'aviso: codex não suporta thinking; opção ignorada.',
    }));

    const [, calledArgs] = mockRunCli.mock.calls[0] as [string, string[], unknown];
    expect(calledArgs).not.toContain('thinking');
    expect(calledArgs).toEqual(expect.arrayContaining(['-c', 'model_reasoning_effort="high"']));
    expect(mockRunCli).toHaveBeenCalledWith(expect.any(String), expect.any(Array), expect.objectContaining({
      timeoutMs: 1_800_000,
    }));
  });

  it('flags structured error events with level: error', async () => {
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(JSON.stringify({
        type: 'turn.failed',
        error: { message: 'boom' },
      }));
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature({
      id: 'feat-06',
      title: 'Feature',
      tool: 'codex',
      effort: 'medium',
      dependsOn: [],
      tasks: [],
    }, 'prompt', { cwd: '/repo', runId: 12 });

    expect(mockEventEmit).toHaveBeenCalledWith('run:output', {
      runId: 12,
      featureId: 'feat-06',
      tool: 'codex',
      line: 'error boom',
      stream: 'stdout',
      source: 'tool',
      createdAt: expect.any(String),
      level: 'error',
    });
  });

  it('flags raw stderr log lines carrying an ERROR level', async () => {
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStderrLine?.('2026-07-16T13:23:27.625650Z ERROR codex_core::tools::router: error=apply_patch verification failed');
      return { code: 0, stdout: '', stderr: '' };
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    await codexAdapter.runFeature({
      id: 'feat-07',
      title: 'Feature',
      tool: 'codex',
      effort: 'medium',
      dependsOn: [],
      tasks: [],
    }, 'prompt', { cwd: '/repo', runId: 13 });

    expect(mockEventEmit).toHaveBeenCalledWith('run:output', {
      runId: 13,
      featureId: 'feat-07',
      tool: 'codex',
      line: '2026-07-16T13:23:27.625650Z ERROR codex_core::tools::router: error=apply_patch verification failed',
      stream: 'stderr',
      source: 'stderr',
      createdAt: expect.any(String),
      level: 'error',
    });
  });
});

describe('codexAdapter token semantics', () => {
  it('separates cached input from Codex raw input without producing a negative component', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const usage = codexAdapter.parseUsage?.(JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 10, cached_input_tokens: 30, output_tokens: 4 },
    }));
    expect(usage).toMatchObject({ input: 0, cachedInput: 30, output: 4, total: 14 });
    expect(usage?.rawUsage).toEqual({ input_tokens: 10, cached_input_tokens: 30, output_tokens: 4 });
  });
});
