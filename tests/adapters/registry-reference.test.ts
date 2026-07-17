import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveRuntimeConfig = vi.fn();

vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: mockResolveRuntimeConfig,
}));

describe('adapter registry tool references', () => {
  beforeEach(() => {
    mockResolveRuntimeConfig.mockReturnValue({
      tools: [
        { id: 'claude', adapter: 'claude' },
        { id: 'codex', adapter: 'codex' },
        { id: 'codex-canary', adapter: 'codex' },
      ],
    });
  });

  it('resolves multiple registered ids to the same adapter', async () => {
    const { getAdapter } = await import('../../src/core/adapters/index.js');

    expect(getAdapter('codex').tool).toBe('codex');
    expect(getAdapter('codex-canary').tool).toBe('codex');
  });

  it('rejects an unregistered id with the available ids', async () => {
    const { getAdapter } = await import('../../src/core/adapters/index.js');

    expect(() => getAdapter('missing-tool')).toThrow(
      'Tool "missing-tool" is not registered. Register it in config.tools or use one of: claude, codex, codex-canary.',
    );
  });
});
