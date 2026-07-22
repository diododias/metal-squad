import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunCli = vi.fn();
const mockCliAbortErrorClass = class CliAbortError extends Error {
  constructor(
    public readonly stdout: string,
    public readonly stderr: string,
    public readonly runtimeMs: number,
  ) {
    super('CLI aborted');
    this.name = 'CliAbortError';
  }
};

const mockEmit = vi.fn();
const mockMsqEventBus = { emit: mockEmit };
const mockParseControlSignal = vi.fn();
const mockResolveToolInvocation = vi.fn(() => ({ command: 'opencode', baseArgs: [], env: {}, versionCheck: ['--version'], minTimeoutMs: 0 }));

vi.mock('../../src/core/adapters/spawn.js', () => ({
  runCli: mockRunCli,
  resolveToolInvocation: mockResolveToolInvocation,
  CliAbortError: mockCliAbortErrorClass,
}));
vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: mockMsqEventBus,
  logCaughtError: vi.fn(),
}));
vi.mock('../../src/core/adapters/control.js', () => ({
  parseControlSignal: mockParseControlSignal,
}));

const MOCK_FEATURE = {
  id: 'feat-1',
  title: 'Test Feature',
  tool: 'opencode' as const,
  effort: 'medium' as const,
  skills: [],
};

const MOCK_OPTS = {
  runId: 1,
  cwd: '/cwd',
  signal: undefined,
};

beforeEach(() => {
  vi.resetModules();
  mockRunCli.mockReset();
  mockEmit.mockReset();
  mockParseControlSignal.mockReset().mockReturnValue(undefined);
  mockResolveToolInvocation.mockReturnValue({ command: 'opencode', baseArgs: [], env: {}, versionCheck: ['--version'], minTimeoutMs: 0 });
});

describe('opencodeAdapter.effortFlag', () => {
  it('always returns an empty array', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    expect(opencodeAdapter.effortFlag('low')).toEqual([]);
    expect(opencodeAdapter.effortFlag('medium')).toEqual([]);
    expect(opencodeAdapter.effortFlag('high')).toEqual([]);
  });
});

describe('opencodeAdapter.parseUsage', () => {
  it('returns null for non-JSON string', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    expect(opencodeAdapter.parseUsage?.('not json')).toBeNull();
  });

  it('returns null when JSON has no usage/tokens field', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    expect(opencodeAdapter.parseUsage?.(JSON.stringify({ response: 'done' }))).toBeNull();
  });

  it('parses usage from .usage field', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = opencodeAdapter.parseUsage?.(JSON.stringify({
      usage: { input: 100, output: 50 },
    }));
    expect(result).toEqual({ input: 100, cachedInput: 0, output: 50, total: 150 });
  });

  it('parses usage from .tokens field', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = opencodeAdapter.parseUsage?.(JSON.stringify({
      tokens: { input: 200, output: 80 },
    }));
    expect(result).toEqual({ input: 200, cachedInput: 0, output: 80, total: 280 });
  });

  it('parses usage from input_tokens/output_tokens aliases', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = opencodeAdapter.parseUsage?.(JSON.stringify({
      usage: { input_tokens: 300, output_tokens: 120 },
    }));
    expect(result).toEqual({ input: 300, cachedInput: 0, output: 120, total: 420 });
  });

  it('defaults input/output to 0 when missing', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = opencodeAdapter.parseUsage?.(JSON.stringify({ usage: {} }));
    expect(result).toEqual({ input: 0, cachedInput: 0, output: 0, total: 0 });
  });
});

describe('opencodeAdapter.runFeature', () => {
  it('returns ok=true with response summary on success', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ response: 'Task completed successfully' }),
      stderr: '',
    });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'do the task', MOCK_OPTS);

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('Task completed');
  });

  it('includes model flag when feature.model is set', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' });
    const featureWithModel = { ...MOCK_FEATURE, model: 'anthropic/claude-opus-4' };

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(featureWithModel as never, 'prompt', MOCK_OPTS);

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).toContain('--model');
    expect(args).toContain('anthropic/claude-opus-4');
  });

  it('does not send --thinking since opencode does not support it natively', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).not.toContain('--thinking');
  });

  it('does not include model flag when feature.model is not set', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).not.toContain('--model');
  });

  it('passes timeoutMs as max(toolTimeoutMs, minTimeoutMs) to runCli', async () => {
    mockResolveToolInvocation.mockReturnValue({ command: 'opencode', baseArgs: [], env: {}, versionCheck: ['--version'], minTimeoutMs: 0 });
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const [, , options] = mockRunCli.mock.calls[0]!;
    expect((options as { timeoutMs: number }).timeoutMs).toBe(600_000);
  });

  it('lets a configured minTimeoutMs floor win over a lower toolTimeoutMs', async () => {
    mockResolveToolInvocation.mockReturnValue({ command: 'opencode', baseArgs: [], env: {}, versionCheck: ['--version'], minTimeoutMs: 900_000 });
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const [, , options] = mockRunCli.mock.calls[0]!;
    expect((options as { timeoutMs: number }).timeoutMs).toBe(900_000);
  });

  it('uses --session when resuming a prior opencode session', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', {
      ...MOCK_OPTS,
      session: {
        mode: 'resume',
        handle: {
          tool: 'opencode',
          sessionId: 'ses_123',
          capturedFromRunId: 1,
          capturedAt: '2026-07-11T00:00:00Z',
        },
      },
    });

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).toContain('--session');
    expect(args).toContain('ses_123');
  });

  it('returns ok=false with stderr when exit code != 0', async () => {
    mockRunCli.mockResolvedValue({ code: 1, stdout: '', stderr: 'fatal error from tool' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('fatal error from tool');
  });

  it('returns ok=false, aborted=true on CliAbortError', async () => {
    mockRunCli.mockRejectedValue(new mockCliAbortErrorClass('', '', 30000));

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.summary).toContain('30s');
  });

  it('captures the session id from the partial stdout on timeout so a later resume can continue it', async () => {
    mockRunCli.mockRejectedValue(Object.assign(new Error('timeout'), {
      name: 'CliTimeoutError',
      stdout: JSON.stringify({ sessionID: 'ses_timeout_1' }),
      stderr: '',
      timeoutMs: 600_000,
      runtimeMs: 605_000,
    }));

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    expect(result.ok).toBe(false);
    expect(result.session).toEqual({
      tool: 'opencode',
      sessionId: 'ses_timeout_1',
      capturedFromRunId: MOCK_OPTS.runId,
      capturedAt: expect.any(String),
    });
  });

  it('falls back to the already-resumed session id on timeout when the partial stdout has no session id yet', async () => {
    mockRunCli.mockRejectedValue(Object.assign(new Error('timeout'), {
      name: 'CliTimeoutError',
      stdout: '',
      stderr: '',
      timeoutMs: 600_000,
      runtimeMs: 605_000,
    }));

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', {
      ...MOCK_OPTS,
      session: {
        mode: 'resume',
        handle: {
          tool: 'opencode',
          sessionId: 'ses_already_resumed',
          capturedFromRunId: 1,
          capturedAt: '2026-07-19T00:00:00Z',
        },
      },
    });

    expect(result.session?.sessionId).toBe('ses_already_resumed');
  });

  it('re-throws non-abort errors', async () => {
    mockRunCli.mockRejectedValue(new Error('unexpected error'));

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await expect(opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS)).rejects.toThrow('unexpected error');
  });

  it('emits run:output for stdout JSON with response field', async () => {
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutChunk }) => {
      onStdoutChunk?.(JSON.stringify({ response: 'agent output here' }));
      return { code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' };
    });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const runOutputCalls = mockEmit.mock.calls.filter(([event]) => event === 'run:output');
    expect(runOutputCalls.length).toBeGreaterThan(0);
    const outputPayload = runOutputCalls[0]?.[1] as Record<string, unknown>;
    expect(outputPayload.line).toContain('agent output here');
    expect(outputPayload.source).toBe('agent');
  });

  it('emits run:output for tool lines', async () => {
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutChunk }) => {
      onStdoutChunk?.(JSON.stringify({ tool: 'bash', input: { command: 'ls' } }));
      return { code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' };
    });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const runOutputCalls = mockEmit.mock.calls.filter(([event]) => event === 'run:output');
    const toolOutput = runOutputCalls.find(([, p]) => (p as Record<string, unknown>).source === 'tool');
    expect(toolOutput).toBeDefined();
    expect((toolOutput?.[1] as Record<string, unknown>).line).toContain('bash');
  });

  it('emits run:output for raw (non-JSON) stdout lines', async () => {
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutChunk }) => {
      onStdoutChunk?.('plain text output');
      return { code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' };
    });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const runOutputCalls = mockEmit.mock.calls.filter(([event]) => event === 'run:output');
    const rawOutput = runOutputCalls.find(([, p]) => (p as Record<string, unknown>).source === 'stdout');
    expect(rawOutput).toBeDefined();
    expect((rawOutput?.[1] as Record<string, unknown>).line).toContain('plain text');
  });

  it('emits run:output for stderr lines', async () => {
    mockRunCli.mockImplementation(async (_tool, _args, { onStderrLine }) => {
      onStderrLine?.('stderr warning message');
      return { code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' };
    });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const runOutputCalls = mockEmit.mock.calls.filter(([event]) => event === 'run:output');
    const stderrOutput = runOutputCalls.find(([, p]) => (p as Record<string, unknown>).stream === 'stderr');
    expect(stderrOutput).toBeDefined();
  });

  it('skips empty stderr lines', async () => {
    mockRunCli.mockImplementation(async (_tool, _args, { onStderrLine }) => {
      onStderrLine?.('   '); // whitespace only
      return { code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' };
    });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const stderrEmits = mockEmit.mock.calls.filter(([, p]) =>
      typeof p === 'object' && (p as Record<string, unknown>).stream === 'stderr',
    );
    expect(stderrEmits).toHaveLength(0);
  });

  it('emits structured status instead of heartbeat output while opencode is running', async () => {
    mockRunCli.mockImplementation(async (_tool, _args, { onStatus, onStdoutChunk }) => {
      onStdoutChunk?.(JSON.stringify({ type: 'tool_use', part: { type: 'tool', tool: 'read', input: { path: '/a.txt' } } }));
      onStatus?.({ runId: 1, featureId: 'feat-1', tool: 'opencode', status: 'idle', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), elapsedMs: 30_000, lastOutputAt: null, idleMs: 30_000, reason: null, terminal: false });
      return { code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' };
    });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const heartbeatOutput = mockEmit.mock.calls.find(([, p]) => (p as Record<string, unknown>).source === 'heartbeat');
    expect(heartbeatOutput).toBeUndefined();
    expect(mockEmit).toHaveBeenCalledWith('run:status', expect.objectContaining({ status: 'idle', runId: 1 }));
  });

  it('emits tokens:update when usage found in stdout JSON line', async () => {
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutChunk }) => {
      onStdoutChunk?.(JSON.stringify({ usage: { input: 100, output: 50 } }));
      return { code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' };
    });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const tokenCalls = mockEmit.mock.calls.filter(([event]) => event === 'tokens:update');
    expect(tokenCalls.length).toBeGreaterThan(0);
    expect((tokenCalls[0]?.[1] as Record<string, unknown>).input).toBe(100);
  });

  it('passes control signal from response', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ response: 'MSQ_INPUT_REQUIRED:Enter value' }),
      stderr: '',
    });
    mockParseControlSignal.mockReturnValue({ type: 'needs_input', prompt: 'Enter value' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    expect(result.control).toEqual({ type: 'needs_input', prompt: 'Enter value' });
  });

  it('does not block a run whose stdout merely mentions "session limit" when a control signal is present', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        response: 'commit 0767d46 feat(notify): suggest and enable adapter fallback resume on Telegram session limit (#218)\nMSQ_DONE: done.',
      }),
      stderr: '',
    });
    mockParseControlSignal.mockReturnValue({ type: 'done', summary: 'done.' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    expect(result.ok).toBe(true);
    expect(result.blocked).toBeUndefined();
    expect(result.control).toEqual({ type: 'done', summary: 'done.' });
  });

  it('still reports a blocked run when stdout mentions a rate limit and no control signal is present', async () => {
    mockRunCli.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ response: 'Error: rate limit exceeded, please retry later' }),
      stderr: '',
    });
    mockParseControlSignal.mockReturnValue(undefined);

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.summary).toContain('session limit reached');
  });

  it('uses raw stdout as summary when JSON has no response field', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: 'plain output text', stderr: '' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('plain output text');
  });

  it('uses exit code in summary when stderr is empty and code != 0', async () => {
    mockRunCli.mockResolvedValue({ code: 2, stdout: '', stderr: '' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('exit 2');
  });
});

describe('opencodeAdapter.runFeature — streaming event parsing', () => {
  function streamAdapter(lines: string[]): Promise<unknown> {
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutChunk }) => {
      for (const line of lines) onStdoutChunk?.(line);
      return { code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' };
    });
    return import('../../src/core/adapters/opencode.js').then(({ opencodeAdapter }) =>
      opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS),
    );
  }

  function streamAdapterChunks(chunks: string[]): Promise<unknown> {
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutChunk }) => {
      for (const chunk of chunks) onStdoutChunk?.(chunk);
      return { code: 0, stdout: chunks.join(''), stderr: '' };
    });
    return import('../../src/core/adapters/opencode.js').then(({ opencodeAdapter }) =>
      opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS),
    );
  }

  function runOutputCalls() {
    return mockEmit.mock.calls.filter(([event]) => event === 'run:output');
  }

  it('parses tool_use streaming events into tool source output', async () => {
    await streamAdapter([
      JSON.stringify({ type: 'tool_use', part: { type: 'tool', tool: 'read', callID: 'c1', input: { path: '/a.txt' } } }),
    ]);
    const toolOutputs = runOutputCalls().filter(([, p]) => (p as Record<string, unknown>).source === 'tool');
    expect(toolOutputs.length).toBe(1);
    expect((toolOutputs[0]?.[1] as Record<string, unknown>).line).toContain('read');
  });

  it('parses text streaming events as agent output', async () => {
    await streamAdapter([
      JSON.stringify({ type: 'text', part: { type: 'text', text: 'Hello from the agent' } }),
    ]);
    const agentOutputs = runOutputCalls().filter(([, p]) => (p as Record<string, unknown>).source === 'agent');
    expect(agentOutputs.length).toBe(1);
    expect((agentOutputs[0]?.[1] as Record<string, unknown>).line).toContain('Hello from the agent');
  });

  it('formats thinking parts with [thinking] prefix', async () => {
    await streamAdapter([
      JSON.stringify({ type: 'thinking', part: { type: 'thinking', reasoning: 'considering options' } }),
    ]);
    const agentOutputs = runOutputCalls().filter(([, p]) => (p as Record<string, unknown>).source === 'agent');
    expect(agentOutputs.length).toBe(1);
    expect((agentOutputs[0]?.[1] as Record<string, unknown>).line).toContain('[thinking]');
    expect((agentOutputs[0]?.[1] as Record<string, unknown>).line).toContain('considering options');
  });

  it('silently skips step_start and step_finish boundary events', async () => {
    await streamAdapter([
      JSON.stringify({ type: 'step_start', part: { id: 'p1', messageID: 'm1' } }),
      JSON.stringify({ type: 'step_finish', part: { id: 'p2', reason: 'tool-calls' } }),
    ]);
    expect(runOutputCalls().length).toBe(0);
  });

  it('does NOT emit raw JSON for unrecognized streaming event types', async () => {
    const unknownEvent = JSON.stringify({ type: 'future_event', part: { type: 'mystery' } });
    await streamAdapter([unknownEvent]);
    const outputs = runOutputCalls();
    expect(outputs.length).toBe(0);
    for (const [, p] of outputs) {
      const line = (p as Record<string, unknown>).line;
      expect(line).not.toContain('future_event');
      expect(line).not.toContain('mystery');
    }
  });

  it('does NOT emit raw JSON for events without a recognizable part type', async () => {
    await streamAdapter([JSON.stringify({ type: 'noop', sessionID: 'ses_1' })]);
    expect(runOutputCalls().length).toBe(0);
  });

  it('ignores structured message objects instead of stringifying them into live output', async () => {
    await expect(streamAdapter([
      JSON.stringify({ type: 'text', message: { nested: 'value' } }),
      JSON.stringify({ type: 'result', response: { nested: 'value' } }),
    ])).resolves.toBeDefined();
    expect(runOutputCalls().length).toBe(0);
  });

  it('parses errors from streaming events with structured error payload', async () => {
    await streamAdapter([
      JSON.stringify({ type: 'error', sessionID: 'ses_1', error: { name: 'UnknownError', data: { message: 'Unexpected server error' } } }),
    ]);
    const stdoutOutputs = runOutputCalls().filter(([, p]) => (p as Record<string, unknown>).source === 'stdout');
    expect(stdoutOutputs.length).toBe(1);
    expect((stdoutOutputs[0]?.[1] as Record<string, unknown>).line).toContain('UnknownError');
    expect((stdoutOutputs[0]?.[1] as Record<string, unknown>).line).toContain('Unexpected server error');
  });

  it('still recognizes flat legacy tool shape (top-level tool/input)', async () => {
    await streamAdapter([
      JSON.stringify({ tool: 'bash', input: { command: 'ls' } }),
    ]);
    const toolOutputs = runOutputCalls().filter(([, p]) => (p as Record<string, unknown>).source === 'tool');
    expect(toolOutputs.length).toBe(1);
    expect((toolOutputs[0]?.[1] as Record<string, unknown>).line).toContain('bash');
    expect((toolOutputs[0]?.[1] as Record<string, unknown>).line).toContain('ls');
  });

  it('parses complete JSON events even when stdout chunks split them mid-object', async () => {
    const eventA = JSON.stringify({ type: 'tool_use', part: { type: 'tool', tool: 'read', input: { path: '/a.txt' } } });
    const eventB = JSON.stringify({ type: 'text', part: { type: 'text', text: 'done' } });
    await streamAdapterChunks([
      eventA.slice(0, 27),
      eventA.slice(27) + eventB.slice(0, 19),
      eventB.slice(19),
    ]);
    const outputs = runOutputCalls();
    expect(outputs.some(([, p]) => String((p as Record<string, unknown>).line).includes('tool read'))).toBe(true);
    expect(outputs.some(([, p]) => String((p as Record<string, unknown>).line).includes('done'))).toBe(true);
  });
});
