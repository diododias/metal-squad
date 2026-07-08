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

vi.mock('../../src/core/adapters/spawn.js', () => ({
  runCli: mockRunCli,
  CliAbortError: mockCliAbortErrorClass,
}));
vi.mock('../../src/core/events/index.js', () => ({
  msqEventBus: mockMsqEventBus,
}));
vi.mock('../../src/core/adapters/control.js', () => ({
  parseControlSignal: mockParseControlSignal,
}));

const MOCK_FEATURE = {
  id: 'feat-1',
  title: 'Test Feature',
  tool: 'opencode' as const,
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
    expect(result).toEqual({ input: 100, output: 50, total: 150 });
  });

  it('parses usage from .tokens field', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = opencodeAdapter.parseUsage?.(JSON.stringify({
      tokens: { input: 200, output: 80 },
    }));
    expect(result).toEqual({ input: 200, output: 80, total: 280 });
  });

  it('parses usage from input_tokens/output_tokens aliases', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = opencodeAdapter.parseUsage?.(JSON.stringify({
      usage: { input_tokens: 300, output_tokens: 120 },
    }));
    expect(result).toEqual({ input: 300, output: 120, total: 420 });
  });

  it('defaults input/output to 0 when missing', async () => {
    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    const result = opencodeAdapter.parseUsage?.(JSON.stringify({ usage: {} }));
    expect(result).toEqual({ input: 0, output: 0, total: 0 });
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

  it('does not include model flag when feature.model is not set', async () => {
    mockRunCli.mockResolvedValue({ code: 0, stdout: JSON.stringify({ response: 'done' }), stderr: '' });

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS);

    const [, args] = mockRunCli.mock.calls[0]!;
    expect(args).not.toContain('--model');
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

  it('re-throws non-abort errors', async () => {
    mockRunCli.mockRejectedValue(new Error('unexpected error'));

    const { opencodeAdapter } = await import('../../src/core/adapters/opencode.js');
    await expect(opencodeAdapter.runFeature(MOCK_FEATURE as never, 'prompt', MOCK_OPTS)).rejects.toThrow('unexpected error');
  });

  it('emits run:output for stdout JSON with response field', async () => {
    let capturedOnStdoutLine: ((line: string) => void) | undefined;
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutLine }) => {
      capturedOnStdoutLine = onStdoutLine;
      onStdoutLine?.(JSON.stringify({ response: 'agent output here' }));
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
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutLine }) => {
      onStdoutLine?.(JSON.stringify({ tool: 'bash', input: { command: 'ls' } }));
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
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutLine }) => {
      onStdoutLine?.('plain text output');
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

  it('emits tokens:update when usage found in stdout JSON line', async () => {
    mockRunCli.mockImplementation(async (_tool, _args, { onStdoutLine }) => {
      onStdoutLine?.(JSON.stringify({ usage: { input: 100, output: 50 } }));
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
