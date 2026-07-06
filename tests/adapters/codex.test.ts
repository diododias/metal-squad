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
  loadConfig: () => ({ toolTimeoutMs: 600_000 }),
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
    expect(result.usage).toEqual({ input: 120, output: 40, total: 160 });
    expect(mockRunCli).toHaveBeenCalledWith(
      'codex',
      expect.any(Array),
      expect.objectContaining({
        cwd: '/repo',
        heartbeatMs: 30_000,
        logLabel: 'codex feat-02',
        onHeartbeat: expect.any(Function),
        onStdoutLine: expect.any(Function),
        heartbeatSuffix: expect.any(Function),
      }),
    );
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', {
      runId: 7,
      featureId: 'feat-02',
      tool: 'codex',
      input: 120,
      output: 40,
      total: 160,
    });
  });
});
