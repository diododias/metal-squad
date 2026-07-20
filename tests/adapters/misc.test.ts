import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mockRunCli = vi.fn();
const mockSpawn = vi.fn();
const mockExecFileSync = vi.fn();
const mockEventEmit = vi.fn();
const mockResolveRuntimeConfig = vi.fn();

const DEFAULT_TOOLS = [
  { id: 'claude', adapter: 'claude', command: 'claude', baseArgs: [], env: {}, versionCheck: ['--version'] },
  { id: 'codex', adapter: 'codex', command: 'codex', baseArgs: [], env: {}, versionCheck: ['--version'] },
  { id: 'opencode', adapter: 'opencode', command: 'opencode', baseArgs: [], env: {}, versionCheck: ['--version'] },
];

vi.mock('../../src/config/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/config/index.js')>('../../src/config/index.js');
  return { ...actual, resolveRuntimeConfig: mockResolveRuntimeConfig };
});

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
  logCaughtError: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveRuntimeConfig.mockReturnValue({
    toolTimeoutMs: 600_000,
    idleThresholdMs: 30_000,
    tools: DEFAULT_TOOLS,
  });
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

describe('tool registry spawn resolution', () => {
  it('uses adapter defaults when a legacy registry entry omits runtime settings', async () => {
    const { resolveToolInvocation } = await import('../../src/core/adapters/spawn.js');

    expect(resolveToolInvocation('codex', '/repo')).toMatchObject({
      capabilities: { model: true, effort: true, thinking: false },
      thinkingBudget: { low: 0, medium: 0, high: 0 },
      minTimeoutMs: 1_800_000,
    });
  });

  it('launches the configured command with baseArgs and merged env', async () => {
    mockResolveRuntimeConfig.mockReturnValue({
      toolTimeoutMs: 600_000,
      idleThresholdMs: 30_000,
      tools: [
        DEFAULT_TOOLS[0],
        {
          ...DEFAULT_TOOLS[1],
          command: 'codex-canary',
          baseArgs: ['--registry-flag'],
          env: { CODEX_CHANNEL: 'canary' },
          versionCheck: ['version', '--json'],
          minTimeoutMs: 1_900_000,
        },
        DEFAULT_TOOLS[2],
      ],
    });
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const { codexAdapter } = await import('../../src/core/adapters/codex.js');

    await codexAdapter.runFeature(
      { id: 'feat-1', title: 'Feature', tool: 'codex', effort: 'medium', dependsOn: [], tasks: [] },
      'PROMPT',
      { cwd: '/repo', runId: 1 },
    );

    expect(mockRunCli).toHaveBeenCalledWith(
      'codex-canary',
      expect.arrayContaining(['--registry-flag', 'exec']),
      expect.objectContaining({ env: { CODEX_CHANNEL: 'canary' }, timeoutMs: 1_900_000 }),
    );

    codexAdapter.isAvailable?.();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'codex-canary',
      ['version', '--json'],
      { stdio: 'ignore' },
    );
  });
});

describe('claude adapter', () => {
  it('keeps effortFlag empty since effort no longer selects a model tier', async () => {
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    expect(claudeAdapter.effortFlag('low')).toEqual([]);
    expect(claudeAdapter.effortFlag('medium')).toEqual([]);
    expect(claudeAdapter.effortFlag('high')).toEqual([]);
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
          thinking: 'off',
          model: 'custom',
          dependsOn: [],
          tasks: [],
        },
        'PROMPT',
        { cwd: '/repo', runId: 2 },
      ),
    ).resolves.toMatchObject({
      ok: true,
      summary: 'done',
      usage: { input: 2, cachedInput: 0, output: 3, total: 5 },
      session: {
        tool: 'claude',
        capturedFromRunId: 2,
      },
    });
    expect(mockRunCli).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--print', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--model', 'custom', '--', 'PROMPT']),
      expect.objectContaining({
        cwd: '/repo',
        env: { MAX_THINKING_TOKENS: '0' },
        idleThresholdMs: 30_000,
        onStatus: expect.any(Function),
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
      cachedInput: 0,
      output: 3,
      total: 5,
    });
  });

  it('coexists model, effort and thinking=on in the spawn', async () => {
    mockResolveRuntimeConfig.mockReturnValue({
      toolTimeoutMs: 600_000,
      idleThresholdMs: 30_000,
      tools: [
        { ...DEFAULT_TOOLS[0], thinkingBudget: { low: 1_234, medium: 5_678, high: 9_876 } },
        DEFAULT_TOOLS[1],
        DEFAULT_TOOLS[2],
      ],
    });
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

    await claudeAdapter.runFeature(
      {
        id: 'feat-1',
        title: 'Feature',
        tool: 'claude',
        effort: 'high',
        thinking: 'on',
        model: 'custom',
        dependsOn: [],
        tasks: [],
      },
      'PROMPT',
      { cwd: '/repo', runId: 4 },
    );

    expect(mockRunCli).toHaveBeenCalledWith(
      'claude',
      expect.arrayContaining(['--model', 'custom']),
      expect.objectContaining({ env: { MAX_THINKING_TOKENS: '9876' } }),
    );
  });

  it('passes timeoutMs as max(toolTimeoutMs, minTimeoutMs) to runCli, respecting the claude registry floor', async () => {
    mockResolveRuntimeConfig.mockReturnValue({
      toolTimeoutMs: 600_000,
      idleThresholdMs: 30_000,
      tools: DEFAULT_TOOLS,
    });
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await claudeAdapter.runFeature(
      { id: 'feat-1', title: 'Feature', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      'PROMPT',
      { cwd: '/repo', runId: 1 },
    );

    expect(mockRunCli).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({ timeoutMs: 3_600_000 }),
    );
  });

  it('lets a repo-configured toolTimeoutMs above the claude floor win', async () => {
    mockResolveRuntimeConfig.mockReturnValue({
      toolTimeoutMs: 7_200_000,
      idleThresholdMs: 30_000,
      tools: DEFAULT_TOOLS,
    });
    mockRunCli.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await claudeAdapter.runFeature(
      { id: 'feat-1', title: 'Feature', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      'PROMPT',
      { cwd: '/repo', runId: 1 },
    );

    expect(mockRunCli).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.objectContaining({ timeoutMs: 7_200_000 }),
    );
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
      createdAt: expect.any(String),
    });
    expect(mockEventEmit).toHaveBeenCalledWith('run:output', {
      runId: 4,
      featureId: 'feat-1',
      tool: 'claude',
      line: 'warning: still running',
      stream: 'stderr',
      source: 'stderr',
      createdAt: expect.any(String),
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

  it('transitions tool calls from started to completed when a tool_result user event arrives', async () => {
    const toolUseId = 'toolu_01abc';
    const assistant = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: toolUseId, name: 'Read', input: { file_path: '/repo/x.ts' } }],
      },
    });
    const userResult = JSON.stringify({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'line1\nline2', is_error: false }],
      },
    });
    const resultLine = JSON.stringify({ type: 'result', subtype: 'success', result: 'done' });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(assistant);
      opts.onStdoutLine?.(userResult);
      return { code: 0, stdout: resultLine, stderr: '' };
    });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await claudeAdapter.runFeature(
      { id: 'feat-1', title: 'F', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      'PROMPT',
      { cwd: '/repo', runId: 8 },
    );

    const toolCallEmits = mockEventEmit.mock.calls.filter((c) => c[0] === 'tool:call') as Array<[string, { id: string; phase: string; output: string | null; error: string | null; completedAt: string | null }]>;
    expect(toolCallEmits.map(([, payload]) => [payload.id, payload.phase])).toEqual([
      [toolUseId, 'started'],
      [toolUseId, 'completed'],
    ]);
    const completed = toolCallEmits[1]![1];
    expect(completed.output).toBe('"line1\\nline2"');
    expect(completed.error).toBeNull();
    expect(completed.completedAt).not.toBeNull();
  });

  it('transitions tool calls to failed when a tool_result is_error true', async () => {
    const toolUseId = 'toolu_fail';
    const assistant = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', id: toolUseId, name: 'Bash', input: { cmd: 'exit 1' } }],
      },
    });
    const userResult = JSON.stringify({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'permission denied', is_error: true }],
      },
    });
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      opts.onStdoutLine?.(assistant);
      opts.onStdoutLine?.(userResult);
      return { code: 0, stdout: JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }), stderr: '' };
    });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await claudeAdapter.runFeature(
      { id: 'feat-1', title: 'F', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      'PROMPT',
      { cwd: '/repo', runId: 9 },
    );

    const toolCallEmits = mockEventEmit.mock.calls.filter((c) => c[0] === 'tool:call') as Array<[string, { id: string; phase: string; error: string | null }]>;
    expect(toolCallEmits.map(([, payload]) => [payload.id, payload.phase])).toEqual([
      [toolUseId, 'started'],
      [toolUseId, 'failed'],
    ]);
    const failed = toolCallEmits[1]![1];
    expect(failed.error).toBe('"permission denied"');
  });

  it('handles a realistic interleaved stream of multiple tool_use/tool_result pairs in order', async () => {
    // Mirrors the real Claude stream-json shape: the assistant can emit several
    // tool_use blocks in one message, and several tool_result blocks arrive
    // together in a single user message. The test asserts that each tool call
    // reaches its terminal phase in the right order — this is the exact
    // scenario that produced the F-4HGA24AJ regression where every card
    // stayed blue.
    const lines: string[] = [
      JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg_1',
          content: [
            { type: 'tool_use', id: 'toolu_a', name: 'Read', input: { file_path: '/repo/a.ts' } },
            { type: 'tool_use', id: 'toolu_b', name: 'Bash', input: { cmd: 'ls' } },
          ],
          usage: { input_tokens: 100, output_tokens: 20 },
        },
      }),
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_a', content: 'aaaa', is_error: false },
            { type: 'tool_result', tool_use_id: 'toolu_b', content: 'file1\nfile2', is_error: false },
          ],
        },
      }),
      JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg_2',
          content: [
            { type: 'text', text: 'agora vou tentar uma bash que falha' },
            { type: 'tool_use', id: 'toolu_c', name: 'Bash', input: { cmd: 'false' } },
          ],
          usage: { input_tokens: 150, output_tokens: 30 },
        },
      }),
      JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_c', content: 'non-zero exit', is_error: true },
          ],
        },
      }),
    ];
    mockRunCli.mockImplementation(async (_bin, _args, opts) => {
      for (const line of lines) opts.onStdoutLine?.(line);
      return { code: 0, stdout: JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }), stderr: '' };
    });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await claudeAdapter.runFeature(
      { id: 'feat-1', title: 'F', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      'PROMPT',
      { cwd: '/repo', runId: 10 },
    );

    const emits = mockEventEmit.mock.calls.filter((c) => c[0] === 'tool:call') as Array<[string, { id: string; phase: string }]>;
    // emitToolCall only synthesizes a synthetic `started` for a terminal
    // phase when the `tool_use` was never seen — since the assistant message
    // pre-registers both toolu_a and toolu_b in the `seen` set, the matching
    // tool_result blocks just transition them straight to `completed`. The
    // total is 6 emits: 2 started (msg_1) + 2 completed (user 1) + 1 started
    // (msg_2 toolu_c) + 1 failed (user 2 toolu_c).
    const transitions = emits.map(([, payload]) => [payload.id, payload.phase] as const);
    expect(transitions).toEqual([
      ['toolu_a', 'started'],
      ['toolu_b', 'started'],
      ['toolu_a', 'completed'],
      ['toolu_b', 'completed'],
      ['toolu_c', 'started'],
      ['toolu_c', 'failed'],
    ]);
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

  it('uses --resume when a session handle is provided', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }), stderr: '' });
    const { claudeAdapter } = await import('../../src/core/adapters/claude.js');

    await claudeAdapter.runFeature(
      { id: 'feat-1', title: 'F', tool: 'claude', effort: 'medium', dependsOn: [], tasks: [] },
      'PROMPT',
      {
        cwd: '/repo',
        runId: 5,
        session: {
          mode: 'resume',
          handle: {
            tool: 'claude',
            sessionId: 'session-123',
            capturedFromRunId: 1,
            capturedAt: '2026-07-11T00:00:00Z',
          },
        },
      },
    );

    const [, args] = mockRunCli.mock.calls.at(-1)!;
    expect(args).toContain('--resume');
    expect(args).toContain('session-123');
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
    expect(result.usage).toEqual({ input: 8, cachedInput: 0, output: 5, total: 13 });
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', {
      runId: 5,
      featureId: 'feat-1',
      tool: 'claude',
      input: 8,
      cachedInput: 0,
      output: 5,
      total: 13,
    });
  });
});

describe('opencode adapter', () => {
  it('reads capabilities from the resolved registry entry', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ response: 'done' }),
      stderr: '',
    });
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');

    await opencodeAdapter.runFeature(
      {
        id: 'feat-1',
        title: 'Feature',
        tool: 'opencode',
        effort: 'high',
        thinking: 'on',
        dependsOn: [],
        tasks: [],
      },
      'test-prompt',
      { cwd: '/repo', runId: 20 },
    );

    expect(mockEventEmit).toHaveBeenCalledWith('run:output', expect.objectContaining({
      runId: 20,
      featureId: 'feat-1',
      tool: 'opencode',
      line: 'aviso: opencode não suporta effort; opção ignorada.',
    }));
    expect(mockEventEmit).toHaveBeenCalledWith('run:output', expect.objectContaining({
      runId: 20,
      featureId: 'feat-1',
      tool: 'opencode',
      line: 'aviso: opencode não suporta thinking; opção ignorada.',
    }));

    const [, calledArgs] = mockRunCli.mock.calls[0] as [string, string[], unknown];
    expect(calledArgs).not.toContain('--thinking');
  });

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
    ).resolves.toEqual({ ok: false, summary: 'exit 2. stderr final: bad' });
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
      usage: { input: 5, cachedInput: 0, output: 7, total: 12 },
    });
    expect(opencodeAdapter.parseUsage?.(JSON.stringify({
      tokens: { input_tokens: 1, output_tokens: 4 },
    }))).toEqual({ input: 1, cachedInput: 0, output: 4, total: 5 });
    expect(opencodeAdapter.parseUsage?.('not-json')).toBeNull();
    expect(mockEventEmit).toHaveBeenCalledWith('tokens:update', {
      runId: 7,
      featureId: 'feat-1',
      tool: 'opencode',
      input: 5,
      cachedInput: 0,
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
