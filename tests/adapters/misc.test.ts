import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mockRunCli = vi.fn();
const mockSpawn = vi.fn();
const mockExecFileSync = vi.fn();
const mockEventEmit = vi.fn();

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

vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: {
    emit: mockEventEmit,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockExecFileSync.mockReset();
  mockEventEmit.mockReset();
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
        { cwd: '/repo', runId: 1 },
      ),
    ).resolves.toEqual({ ok: false, summary: 'exit 1. stderr final: fatal' });
  });

  it('parses successful stream-json output and usage', async () => {
    const resultLine = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'done',
      usage: { input_tokens: 2, output_tokens: 3 },
    });
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: resultLine,
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
        { cwd: '/repo', runId: 2 },
      ),
    ).resolves.toEqual({
      ok: true,
      summary: 'done',
      usage: { input: 2, output: 3, total: 5 },
    });
    expect(mockRunCli).toHaveBeenCalledWith(
      'claude',
      ['--print', '--output-format', 'stream-json', '--dangerously-skip-permissions', '--model', 'custom', '--', 'PROMPT'],
      expect.objectContaining({
        cwd: '/repo',
        heartbeatMs: 30_000,
        logLabel: 'claude feat-1',
        onHeartbeat: expect.any(Function),
        onStdoutLine: expect.any(Function),
        onStderrLine: expect.any(Function),
        heartbeatSuffix: expect.any(Function),
      }),
    );
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', {
      runId: 2,
      featureId: 'feat-1',
      tool: 'claude',
      input: 2,
      output: 3,
      total: 5,
    });
  });

  it('handles malformed JSON and max-turn errors', async () => {
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    expect(claudeAdapter.parseUsage?.('not-json')).toBeNull();
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ type: 'result', subtype: 'error_max_turns', result: 'partial' }),
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
        { cwd: '/repo', runId: 3 },
      ),
    ).resolves.toMatchObject({ ok: false, summary: 'partial' });
  });

  it('emits incremental stdout and stderr snippets while the run is active', async () => {
    const assistantLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'Atualizando prompt builder agora.' }],
      },
    });
    const resultLine = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'done',
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(assistantLine);
      opts.onStderrLine?.('warning: still running');
      return {
        code: 0,
        stdout: resultLine,
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
      { cwd: '/repo', runId: 4 },
    );

    expect(mockEventEmit).toHaveBeenCalledWith('run:output', {
      runId: 4,
      featureId: 'feat-1',
      tool: 'claude',
      line: 'Atualizando prompt builder agora.',
      stream: 'stdout',
      source: 'agent',
    });
    expect(mockEventEmit).toHaveBeenCalledWith('run:output', {
      runId: 4,
      featureId: 'feat-1',
      tool: 'claude',
      line: 'warning: still running',
      stream: 'stderr',
      source: 'stderr',
    });
  });

  it('emits cumulative tokens:update from per-message usage during the stream', async () => {
    const assistant1 = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'primeira etapa' }],
        usage: { input_tokens: 100, output_tokens: 20 },
      },
    });
    const assistant2 = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: 'segunda etapa' }],
        usage: { input_tokens: 150, output_tokens: 30 },
      },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(assistant1);
      opts.onStdoutLine?.(assistant2);
      return { code: 0, stdout: '', stderr: '' };
    });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await claudeAdapter.runFeature(
      { id: 'feat-1', title: 'F', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      'PROMPT',
      { cwd: '/repo', runId: 7 },
    );

    // Primeiro assistant: output acumulado = 20.
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', expect.objectContaining({
      runId: 7,
      input: 100,
      output: 20,
      total: 120,
    }));
    // Segundo assistant: output acumula (20 + 30 = 50), input passa ao mais recente.
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', expect.objectContaining({
      runId: 7,
      input: 150,
      output: 50,
      total: 200,
    }));
  });

  it('passes --print as boolean flag and prompt as positional arg after --', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ result: 'ok' }), stderr: '' });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');
    const frontMatterPrompt = '---\nname: "speckit-specify"\n---\nprompt body';

    await claudeAdapter.runFeature(
      { id: 'feat-1', title: 'F', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      frontMatterPrompt,
      { cwd: '/repo', runId: 99 },
    );

    const [, args] = mockRunCli.mock.calls[0] as [string, string[], unknown];
    expect(args).not.toContain('-p');
    expect(args.includes('--print')).toBe(true);
    const doubleDashIdx = args.indexOf('--');
    expect(doubleDashIdx).toBeGreaterThan(-1);
    expect(args[doubleDashIdx + 1]).toBe(frontMatterPrompt);
  });

  it('returns timeout summary with partial output, touched files and parsed usage', async () => {
    const { CliTimeoutError } = await import('../../src/core/adapters/spawn.js');
    const transcript = JSON.stringify({
      type: 'result',
      subtype: 'success',
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
      { cwd: '/repo', runId: 5 },
    );

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('timeout após 605s');
    expect(result.summary).toContain('última mensagem do agente: Aplicando ajustes nos testes finais.');
    expect(result.summary).toContain(
      'arquivos tocados: src/core/adapters/claude.ts, tests/adapters/misc.test.ts',
    );
    expect(result.usage).toEqual({ input: 8, output: 5, total: 13 });
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', {
      runId: 5,
      featureId: 'feat-1',
      tool: 'claude',
      input: 8,
      output: 5,
      total: 13,
    });
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
        { cwd: '/repo', runId: 6 },
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
        { cwd: '/repo', runId: 7 },
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
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', {
      runId: 7,
      featureId: 'feat-1',
      tool: 'opencode',
      input: 5,
      output: 7,
      total: 12,
    });
  });
});

describe('codex adapter', () => {
  it('places supported options before the prompt positional arg, separated by --', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');
    const frontMatterPrompt = '---\nname: "speckit-specify"\n---\nprompt body';

    await codexAdapter.runFeature(
      { id: 'feat-1', title: 'F', tool: 'codex', effort: 'high', model: 'o3', dependsOn: [], tasks: [] },
      frontMatterPrompt,
      { cwd: '/repo', runId: 10 },
    );

    const [, args] = mockRunCli.mock.calls[0] as [string, string[], unknown];
    expect(args[0]).toBe('exec');
    const doubleDashIdx = args.indexOf('--');
    expect(doubleDashIdx).toBeGreaterThan(-1);
    expect(args[doubleDashIdx + 1]).toBe(frontMatterPrompt);
    // all option flags must appear before --
    const optionArgs = args.slice(0, doubleDashIdx);
    expect(optionArgs).toContain('--json');
    expect(optionArgs).toContain('--skip-git-repo-check');
    expect(optionArgs).toContain('--sandbox');
    expect(optionArgs).toContain('workspace-write');
    expect(optionArgs).toContain('-m');
    expect(optionArgs).not.toContain('--ask-for-approval');
  });

  it('maps effort tiers via -c config flag', async () => {
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');

    expect(codexAdapter.effortFlag('low')).toEqual(['-c', 'model_reasoning_effort="low"']);
    expect(codexAdapter.effortFlag('medium')).toEqual(['-c', 'model_reasoning_effort="medium"']);
    expect(codexAdapter.effortFlag('high')).toEqual(['-c', 'model_reasoning_effort="high"']);
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

  it('times out, kills the child and emits heartbeat callbacks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T10:00:00Z'));

    const { child } = makeChild();
    mockSpawn.mockReturnValue(child);
    const onHeartbeat = vi.fn();
    const { CliTimeoutError, runCli } = await vi.importActual<typeof import('../../src/core/adapters/spawn.js')>(
      '../../src/core/adapters/spawn.js',
    );

    const promise = runCli('codex', ['run'], {
      cwd: '/repo',
      timeoutMs: 50,
      heartbeatMs: 20,
      heartbeatSuffix: () => 'extra',
      onHeartbeat,
    });
    const captured = promise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(60);

    expect(await captured).toBeInstanceOf(CliTimeoutError);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(onHeartbeat).toHaveBeenCalledWith(expect.stringContaining('[msq] codex running for'));
    expect(onHeartbeat).toHaveBeenCalledWith(expect.stringContaining('extra'));
  });
});
