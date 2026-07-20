import { afterEach, describe, expect, it, vi } from 'vitest';

const mockParseAsync = vi.fn();
const mockName = vi.fn();
const mockDescription = vi.fn();
const mockVersion = vi.fn();
const mockHook = vi.fn();
const mockOpts = vi.fn(() => ({}));
const mockRegisterInit = vi.fn();
const mockRegisterRun = vi.fn();
const mockRegisterResume = vi.fn();
const mockRegisterSkills = vi.fn();
const mockRegisterStatus = vi.fn();
const mockRegisterUi = vi.fn();
const mockCommandCreate = vi.fn();
const mockCommandOption = vi.fn();
const mockCommandAction = vi.fn();

class MockCommand {
  name = mockName.mockReturnThis();
  description = mockDescription.mockReturnThis();
  version = mockVersion.mockReturnThis();
  hook = mockHook.mockReturnThis();
  opts = mockOpts;
  parseAsync = mockParseAsync;
  command = mockCommandCreate.mockReturnThis();
  option = mockCommandOption.mockReturnThis();
  action = mockCommandAction.mockReturnThis();
}

vi.mock('commander', () => ({
  Command: MockCommand,
}));

vi.mock('../src/commands/init.js', () => ({
  registerInit: mockRegisterInit,
}));

vi.mock('../src/commands/run.js', () => ({
  registerRun: mockRegisterRun,
}));

vi.mock('../src/commands/skills.js', () => ({
  registerSkills: mockRegisterSkills,
}));

vi.mock('../src/commands/resume.js', () => ({
  registerResume: mockRegisterResume,
}));

vi.mock('../src/commands/status.js', () => ({
  registerStatus: mockRegisterStatus,
}));

vi.mock('../src/commands/ui.js', () => ({
  registerUi: mockRegisterUi,
}));

describe('cli bootstrap', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('registers commands and parses argv', async () => {
    const { run } = await import('../src/cli.js');

    await run(['node', 'msq']);

    expect(mockName).toHaveBeenCalledWith('msq');
    expect(mockDescription).toHaveBeenCalledWith(
      'metal-squad — orquestrador de pipelines spec-kit com IA',
    );
    expect(mockVersion).toHaveBeenCalledWith('0.0.1');
    expect(mockRegisterInit).toHaveBeenCalled();
    expect(mockRegisterRun).toHaveBeenCalled();
    expect(mockRegisterResume).toHaveBeenCalled();
    expect(mockRegisterSkills).toHaveBeenCalled();
    expect(mockRegisterStatus).toHaveBeenCalled();
    expect(mockRegisterUi).toHaveBeenCalled();
    expect(mockParseAsync).toHaveBeenCalledWith(['node', 'msq']);
  });

  it('prints the error message and exits when top-level run fails', async () => {
    vi.resetModules();
    const error = new Error('boom');
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('../src/cli.js', () => ({
      run: vi.fn().mockRejectedValue(error),
    }));

    await import('../src/index.js');
    await Promise.resolve();

    expect(stderr).toHaveBeenCalledWith('boom');
    expect(exit).toHaveBeenCalledWith(1);
  });
});
