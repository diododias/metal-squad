import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCli = vi.fn();
const mockExecFileSync = vi.fn();
const mockEventEmit = vi.fn();

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
  resolveRuntimeConfig: () => ({ toolTimeoutMs: 600_000 }),
}));

vi.mock('../../src/core/adapters/spawn.js', () => ({
  runCli: mockRunCli,
  CliTimeoutError: MockCliTimeoutError,
}));

vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: {
    emit: mockEventEmit,
  },
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

beforeEach(() => {
  mockRunCli.mockReset();
  mockExecFileSync.mockReset();
  mockEventEmit.mockReset();
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
    expect(result.usage).toEqual({ input: 100, cachedInput: 20, output: 40, total: 160 });
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
      input: 100,
      cachedInput: 20,
      output: 40,
      total: 160,
    });
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
    });
  });

  it('declares thinking as unsupported and warns without altering the invocation', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'done' },
      }),
      stderr: '',
    });

    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    expect(codexAdapter.capabilities).toEqual({ thinking: false });

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
  });
});
