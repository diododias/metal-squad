import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mockRunCli = vi.fn();
const mockSpawn = vi.fn();
const mockExecFileSync = vi.fn();

vi.mock('../../src/core/adapters/spawn.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/adapters/spawn.js')>('../../src/core/adapters/spawn.js');
  return {
    ...actual,
    runCli: mockRunCli,
  };
});

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
  execFileSync: mockExecFileSync,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockExecFileSync.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('adapter registry', () => {
  it('returns the correct adapter for each tool', async () => {
    const { getAdapter } = await import('../../src/core/adapters/index.js');

    expect(getAdapter('claude').tool).toBe('claude');
    expect(getAdapter('codex').tool).toBe('codex');
    expect(getAdapter('opencode').tool).toBe('opencode');
  });
});

describe('claude adapter', () => {
  it('maps effort tiers to models', async () => {
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    expect(claudeAdapter.effortFlag('low')).toEqual(['--model', 'haiku']);
    expect(claudeAdapter.effortFlag('medium')).toEqual(['--model', 'sonnet']);
    expect(claudeAdapter.effortFlag('high')).toEqual(['--model', 'opus']);
  });

  it('returns failed result when cli exits with non-zero code', async () => {
    mockRunCli.mockResolvedValue({ code: 1, stdout: '', stderr: 'fatal' });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await expect(
      claudeAdapter.runFeature(
        {
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          dependsOn: [],
          tasks: [],
        },
        'test-prompt',
        '/repo',
      ),
    ).resolves.toEqual({ ok: false, summary: 'exit 1. stderr final: fatal' });
  });

  it('parses successful JSON output and usage', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        result: 'done',
        usage: { input_tokens: 2, output_tokens: 3 },
      }),
      stderr: '',
    });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await expect(
      claudeAdapter.runFeature(
        {
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'medium',
          model: 'custom',
          dependsOn: [],
          tasks: [],
        },
        'PROMPT',
        '/repo',
      ),
    ).resolves.toEqual({
      ok: true,
      summary: 'done',
      usage: { input: 2, output: 3, total: 5 },
    });
    expect(mockRunCli).toHaveBeenCalledWith(
      'claude',
      ['-p', 'PROMPT', '--output-format', 'json', '--dangerously-skip-permissions', '--model', 'custom'],
      expect.objectContaining({
        cwd: '/repo',
        heartbeatMs: 30_000,
        logLabel: 'claude feat-1',
        onStdoutLine: expect.any(Function),
        onStderrLine: expect.any(Function),
        heartbeatSuffix: expect.any(Function),
      }),
    );
  });

  it('handles malformed JSON and max-turn errors', async () => {
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    expect(claudeAdapter.parseUsage?.('not-json')).toBeNull();
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ subtype: 'error_max_turns', result: 'partial' }),
      stderr: '',
    });

    await expect(
      claudeAdapter.runFeature(
        {
          id: 'feat-1',
          title: 'Feature',
          tool: 'claude',
          effort: 'low',
          dependsOn: [],
          tasks: [],
        },
        'test-prompt',
        '/repo',
      ),
    ).resolves.toMatchObject({ ok: false, summary: 'partial' });
  });

  it('logs incremental stdout and stderr snippets while the run is active', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(JSON.stringify({ result: 'Atualizando prompt builder agora.' }));
      opts.onStderrLine?.('warning: still running');
      return {
        code: 0,
        stdout: JSON.stringify({ result: 'done', usage: { input_tokens: 1, output_tokens: 2 } }),
        stderr: '',
      };
    });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await claudeAdapter.runFeature(
      {
        id: 'feat-1',
        title: 'Feature',
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [],
      },
      'PROMPT',
      '/repo',
    );

    expect(log).toHaveBeenCalledWith('[msq] claude feat-1 agente: Atualizando prompt builder agora.');
    expect(log).toHaveBeenCalledWith('[msq] claude feat-1 stderr: warning: still running');
  });

  it('returns timeout summary with partial output, touched files and parsed usage', async () => {
    const { CliTimeoutError } = await import('../../src/core/adapters/spawn.js');
    const transcript = JSON.stringify({
      result: 'Aplicando ajustes nos testes finais.',
      usage: { input_tokens: 8, output_tokens: 5 },
    });
    mockRunCli.mockRejectedValue(
      new CliTimeoutError('claude', 600_000, 605_000, transcript, ''),
    );
    mockExecFileSync.mockReturnValue(
      ' M src/core/adapters/claude.ts\n?? tests/adapters/misc.test.ts\n',
    );
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    const result = await claudeAdapter.runFeature(
      {
        id: 'feat-1',
        title: 'Feature',
        tool: 'claude',
        effort: 'medium',
        dependsOn: [],
        tasks: [],
      },
      'PROMPT',
      '/repo',
    );

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('timeout após 605s');
    expect(result.summary).toContain('última mensagem do agente: Aplicando ajustes nos testes finais.');
    expect(result.summary).toContain(
      'arquivos tocados: src/core/adapters/claude.ts, tests/adapters/misc.test.ts',
    );
    expect(result.usage).toEqual({ input: 8, output: 5, total: 13 });
  });
});

describe('opencode adapter', () => {
  it('keeps effortFlag empty and handles cli failures', async () => {
    mockRunCli.mockResolvedValue({ code: 2, stdout: '', stderr: 'bad' });
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');

    expect(opencodeAdapter.effortFlag('high')).toEqual([]);
    await expect(
      opencodeAdapter.runFeature(
        {
          id: 'feat-1',
          title: 'Feature',
          tool: 'opencode',
          effort: 'high',
          dependsOn: [],
          tasks: [],
        },
        'test-prompt',
        '/repo',
      ),
    ).resolves.toEqual({ ok: false, summary: 'bad' });
  });

  it('parses usage from multiple json shapes', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        response: 'ok',
        usage: { input: 5, output: 7 },
      }),
      stderr: '',
    });
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');

    await expect(
      opencodeAdapter.runFeature(
        {
          id: 'feat-1',
          title: 'Feature',
          tool: 'opencode',
          effort: 'medium',
          model: 'provider/model',
          dependsOn: [],
          tasks: [],
        },
        'test-prompt',
        '/repo',
      ),
    ).resolves.toEqual({
      ok: true,
      summary: 'ok',
      usage: { input: 5, output: 7, total: 12 },
    });
    expect(opencodeAdapter.parseUsage?.(JSON.stringify({
      tokens: { input_tokens: 1, output_tokens: 4 },
    }))).toEqual({ input: 1, output: 4, total: 5 });
    expect(opencodeAdapter.parseUsage?.('not-json')).toBeNull();
  });
});

describe('runCli', () => {
  function makeChild(): {
    child: EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    stdout: EventEmitter;
    stderr: EventEmitter;
  } {
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = stdout;
    child.stderr = stderr;
    child.kill = vi.fn();
    return { child, stdout, stderr };
  }

  it('captures stdout/stderr and drains line callbacks', async () => {
    const { child, stdout, stderr } = makeChild();
    mockSpawn.mockReturnValue(child);
    const outLines: string[] = [];
    const errLines: string[] = [];
    const { runCli } = await vi.importActual<typeof import('../../src/core/adapters/spawn.js')>(
      '../../src/core/adapters/spawn.js',
    );

    const promise = runCli('codex', ['run'], {
      cwd: '/repo',
      onStdoutLine: (line) => outLines.push(line),
      onStderrLine: (line) => errLines.push(line),
    });

    stdout.emit('data', Buffer.from('hello\nwor'));
    stderr.emit('data', Buffer.from('boom\n'));
    stdout.emit('data', Buffer.from('ld'));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      code: 0,
      stdout: 'hello\nworld',
      stderr: 'boom\n',
    });
    expect(outLines).toEqual(['hello', 'world']);
    expect(errLines).toEqual(['boom']);
  });

  it('rejects on child errors', async () => {
    const { child } = makeChild();
    mockSpawn.mockReturnValue(child);
    const { runCli } = await vi.importActual<typeof import('../../src/core/adapters/spawn.js')>(
      '../../src/core/adapters/spawn.js',
    );

    const promise = runCli('codex', ['run'], { cwd: '/repo' });
    child.emit('error', new Error('spawn failed'));

    await expect(promise).rejects.toThrow('spawn failed');
  });

  it('times out, kills the child and emits heartbeat logs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T10:00:00Z'));

    const { child } = makeChild();
    mockSpawn.mockReturnValue(child);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { CliTimeoutError, runCli } = await vi.importActual<typeof import('../../src/core/adapters/spawn.js')>(
      '../../src/core/adapters/spawn.js',
    );

    const promise = runCli('codex', ['run'], {
      cwd: '/repo',
      timeoutMs: 50,
      heartbeatMs: 20,
      heartbeatSuffix: () => 'extra',
    });
    const captured = promise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(60);

    expect(await captured).toBeInstanceOf(CliTimeoutError);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[msq] codex em execução há'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('extra'));
  });
});
