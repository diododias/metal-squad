import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockExecFileAsync = vi.fn();
const mockExecFile = vi.fn();

vi.mock('node:child_process', () => ({ execFile: mockExecFile }));
vi.mock('node:util', () => ({
  promisify: vi.fn(() => mockExecFileAsync),
}));

const originalPlatform = process.platform;

beforeEach(() => {
  vi.resetModules();
  mockExecFileAsync.mockReset().mockResolvedValue({ stdout: '', stderr: '' });
  mockExecFile.mockReset();
});

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
});

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform, writable: true, configurable: true });
}

describe('DesktopChannel', () => {
  it('has name = desktop', async () => {
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();
    expect(ch.name).toBe('desktop');
  });

  it('calls osascript on darwin', async () => {
    setPlatform('darwin');
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await ch.send('Hello World');

    expect(mockExecFileAsync).toHaveBeenCalledWith('osascript', expect.any(Array));
    const [cmd, args] = mockExecFileAsync.mock.calls[0]!;
    expect(cmd).toBe('osascript');
    expect(args.some((a: string) => a.includes('Hello World'))).toBe(true);
  });

  it('escapes double quotes in message on darwin', async () => {
    setPlatform('darwin');
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await ch.send('Say "hello" world');

    const [, args] = mockExecFileAsync.mock.calls[0]!;
    const script = args[1] as string;
    expect(script).toContain('\\"hello\\"');
  });

  it('escapes backslashes in message on darwin', async () => {
    setPlatform('darwin');
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await ch.send('path\\to\\file');

    const [, args] = mockExecFileAsync.mock.calls[0]!;
    const script = args[1] as string;
    expect(script).toContain('\\\\');
  });

  it('calls notify-send on linux', async () => {
    setPlatform('linux');
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await ch.send('Linux notification');

    expect(mockExecFileAsync).toHaveBeenCalledWith('notify-send', ['metal-squad', 'Linux notification']);
  });

  it('calls powershell on win32', async () => {
    setPlatform('win32');
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await ch.send('Windows notification');

    const [cmd] = mockExecFileAsync.mock.calls[0]!;
    expect(cmd).toBe('powershell');
  });

  it('does not call execFile on unsupported platform', async () => {
    setPlatform('freebsd');
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await ch.send('msg');

    expect(mockExecFileAsync).not.toHaveBeenCalled();
  });

  it('does not throw when execFile fails (best-effort)', async () => {
    setPlatform('darwin');
    mockExecFileAsync.mockRejectedValue(new Error('osascript not found'));
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await expect(ch.send('msg')).resolves.toBeUndefined();
  });

  it('includes metal-squad title in darwin notification', async () => {
    setPlatform('darwin');
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await ch.send('test message');

    const [, args] = mockExecFileAsync.mock.calls[0]!;
    const script = args[1] as string;
    expect(script).toContain('metal-squad');
  });

  it('escapes single quotes in win32 message', async () => {
    setPlatform('win32');
    const { DesktopChannel } = await import('../../src/core/notify/desktop.js');
    const ch = new DesktopChannel();

    await ch.send("it's done");

    const [, args] = mockExecFileAsync.mock.calls[0]!;
    const ps = args[1] as string;
    expect(ps).toContain("it''s done");
  });
});
