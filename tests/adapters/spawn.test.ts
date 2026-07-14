import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Create a minimal mock child process
function makeMockChild() {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

const mockSpawn = vi.fn();

vi.mock('node:child_process', () => ({ spawn: mockSpawn }));

beforeEach(() => {
  vi.resetModules();
  mockSpawn.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CliTimeoutError', () => {
  it('has name CliTimeoutError', async () => {
    const { CliTimeoutError } = await import('../../src/core/adapters/spawn.js');
    const err = new CliTimeoutError('mybin', 5000, 4999, 'out', 'err');
    expect(err.name).toBe('CliTimeoutError');
  });

  it('stores all constructor args as properties', async () => {
    const { CliTimeoutError } = await import('../../src/core/adapters/spawn.js');
    const err = new CliTimeoutError('mybin', 5000, 4999, 'out', 'err');
    expect(err.timeoutMs).toBe(5000);
    expect(err.runtimeMs).toBe(4999);
    expect(err.stdout).toBe('out');
    expect(err.stderr).toBe('err');
  });

  it('includes bin and timeout in message', async () => {
    const { CliTimeoutError } = await import('../../src/core/adapters/spawn.js');
    const err = new CliTimeoutError('claude', 60000, 60001, '', '');
    expect(err.message).toContain('claude');
    expect(err.message).toContain('60000');
  });

  it('is instanceof Error', async () => {
    const { CliTimeoutError } = await import('../../src/core/adapters/spawn.js');
    const err = new CliTimeoutError('bin', 1000, 1001, '', '');
    expect(err instanceof Error).toBe(true);
  });
});

describe('CliAbortError', () => {
  it('has name CliAbortError', async () => {
    const { CliAbortError } = await import('../../src/core/adapters/spawn.js');
    const err = new CliAbortError('bin', 1234, 'out', 'err', 'SIGTERM');
    expect(err.name).toBe('CliAbortError');
  });

  it('stores all constructor args as properties', async () => {
    const { CliAbortError } = await import('../../src/core/adapters/spawn.js');
    const err = new CliAbortError('mybin', 2500, 'stdout content', 'stderr content', 'SIGKILL');
    expect(err.runtimeMs).toBe(2500);
    expect(err.stdout).toBe('stdout content');
    expect(err.stderr).toBe('stderr content');
    expect(err.signal).toBe('SIGKILL');
  });

  it('includes bin in message', async () => {
    const { CliAbortError } = await import('../../src/core/adapters/spawn.js');
    const err = new CliAbortError('claude', 1000, '', '', null);
    expect(err.message).toContain('claude');
  });
});

describe('runCli', () => {
  it('resolves with code, stdout, stderr on normal exit', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('node', ['--version'], { cwd: '/cwd' });

    child.stdout.emit('data', Buffer.from('v20.0.0\n'));
    child.emit('close', 0, null);

    const result = await promise;
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('v20.0.0\n');
    expect(result.stderr).toBe('');
  });

  it('resolves with non-zero code on failure', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('node', ['bad'], { cwd: '/cwd' });

    child.stderr.emit('data', Buffer.from('error message'));
    child.emit('close', 1, null);

    const result = await promise;
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('error message');
  });

  it('rejects with error event', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('nonexistent', [], { cwd: '/cwd' });

    const spawnError = new Error('ENOENT');
    child.emit('error', spawnError);

    await expect(promise).rejects.toThrow('ENOENT');
  });

  it('calls onStdoutLine for each complete line', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);
    const lines: string[] = [];

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], { cwd: '/cwd', onStdoutLine: (l) => lines.push(l) });

    child.stdout.emit('data', Buffer.from('line1\nline2\n'));
    child.emit('close', 0, null);
    await promise;

    expect(lines).toContain('line1');
    expect(lines).toContain('line2');
  });

  it('flushes pending stdout line without newline on close', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);
    const lines: string[] = [];

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], { cwd: '/cwd', onStdoutLine: (l) => lines.push(l) });

    child.stdout.emit('data', Buffer.from('partial line without newline'));
    child.emit('close', 0, null);
    await promise;

    expect(lines).toContain('partial line without newline');
  });

  it('calls onStderrLine for each complete line', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);
    const errLines: string[] = [];

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], { cwd: '/cwd', onStderrLine: (l) => errLines.push(l) });

    child.stderr.emit('data', Buffer.from('err1\nerr2\n'));
    child.emit('close', 0, null);
    await promise;

    expect(errLines).toContain('err1');
    expect(errLines).toContain('err2');
  });

  it('rejects with CliAbortError when abortRequested on close', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const controller = new AbortController();
    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], { cwd: '/cwd', signal: controller.signal });

    controller.abort();
    child.emit('close', null, 'SIGTERM');

    await expect(promise).rejects.toThrow('abortado');
  });

  it('already-aborted signal triggers onAbort immediately', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const controller = new AbortController();
    controller.abort();

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], { cwd: '/cwd', signal: controller.signal });

    // kill should have been called
    child.emit('close', null, 'SIGTERM');
    await expect(promise).rejects.toThrow('abortado');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('rejects with CliTimeoutError when timeout fires', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('slow-cmd', [], { cwd: '/cwd', timeoutMs: 5000 });

    // advance timer past timeout
    vi.advanceTimersByTime(6000);

    await expect(promise).rejects.toThrow('excedeu timeout');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('uses 600000ms default timeout when not specified', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], { cwd: '/cwd' });

    // advance to just under default (600s)
    vi.advanceTimersByTime(599999);
    expect(child.kill).not.toHaveBeenCalled();

    vi.advanceTimersByTime(2);
    await expect(promise).rejects.toThrow('excedeu timeout');
  });

  it('calls onHeartbeat at heartbeatMs interval', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);
    const heartbeats: string[] = [];

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], {
      cwd: '/cwd',
      heartbeatMs: 1000,
      onHeartbeat: (msg) => heartbeats.push(msg),
    });

    vi.advanceTimersByTime(3500);
    child.emit('close', 0, null);
    await promise;

    expect(heartbeats.length).toBeGreaterThanOrEqual(3);
    expect(heartbeats[0]).toContain('[msq]');
  });

  it('emits structured running, idle, resumed, and completed statuses independently of heartbeat text', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);
    const statuses: string[] = [];
    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], {
      cwd: '/cwd',
      runId: 4,
      featureId: 'feat-4',
      tool: 'codex',
      idleThresholdMs: 1_000,
      onStatus: (status) => statuses.push(status.status),
    });

    vi.advanceTimersByTime(1_800);
    child.stdout.emit('data', Buffer.from('progress\n'));
    vi.advanceTimersByTime(1_800);
    child.emit('close', 0, null);
    await promise;

    expect(statuses).toEqual(['running', 'idle', 'running', 'idle', 'completed']);
  });

  it('includes logLabel in heartbeat when provided', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);
    const heartbeats: string[] = [];

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], {
      cwd: '/cwd',
      heartbeatMs: 1000,
      logLabel: 'my-process',
      onHeartbeat: (msg) => heartbeats.push(msg),
    });

    vi.advanceTimersByTime(1500);
    child.emit('close', 0, null);
    await promise;

    expect(heartbeats[0]).toContain('my-process');
  });

  it('includes heartbeatSuffix in heartbeat when provided', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);
    const heartbeats: string[] = [];

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], {
      cwd: '/cwd',
      heartbeatMs: 1000,
      heartbeatSuffix: () => 'custom-suffix',
      onHeartbeat: (msg) => heartbeats.push(msg),
    });

    vi.advanceTimersByTime(1500);
    child.emit('close', 0, null);
    await promise;

    expect(heartbeats[0]).toContain('custom-suffix');
  });

  it('uses -1 as code when close event sends null code', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], { cwd: '/cwd' });

    child.emit('close', null, null);
    const result = await promise;
    expect(result.code).toBe(-1);
  });

  it('passes env to spawn', async () => {
    const child = makeMockChild();
    mockSpawn.mockReturnValue(child);

    const { runCli } = await import('../../src/core/adapters/spawn.js');
    const promise = runCli('cmd', [], { cwd: '/cwd', env: { MY_VAR: 'test' } });

    child.emit('close', 0, null);
    await promise;

    const [, , opts] = mockSpawn.mock.calls[0]!;
    expect((opts as Record<string, unknown>).cwd).toBe('/cwd');
    expect(((opts as Record<string, unknown>).env as Record<string, string>)['MY_VAR']).toBe('test');
  });
});
