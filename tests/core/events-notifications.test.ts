import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMsqEventBus } from '../../src/core/events/bus.js';

const mockDispatch = vi.fn();

vi.mock('../../src/core/notify/manager.js', () => ({
  dispatch: mockDispatch,
}));

describe('attachEventNotifications', () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockDispatch.mockResolvedValue(undefined);
  });

  it('dispatches run:start notifications', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('run:start', {
      runId: 7,
      featureId: 'feat-9',
      tool: 'codex',
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'run:start',
      'metal-squad: feat-9 started with codex',
      {
        featureId: 'feat-9',
        tool: 'codex',
      },
    );

    detach();
  });
});
