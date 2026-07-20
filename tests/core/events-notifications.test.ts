import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMsqEventBus } from '../../src/core/events/bus.js';

const mockDispatch = vi.fn();
const mockGetPausedPipelineIdForBudget = vi.fn();
const mockGetRun = vi.fn();
const mockResolveRuntimeConfig = vi.fn();
const mockGetAdapter = vi.fn();

vi.mock('../../src/core/notify/manager.js', () => ({
  dispatch: mockDispatch,
}));
vi.mock('../../src/db/repo.js', () => ({
  getPausedPipelineIdForBudget: mockGetPausedPipelineIdForBudget,
  getRun: mockGetRun,
}));
vi.mock('../../src/config/index.js', () => ({
  resolveRuntimeConfig: mockResolveRuntimeConfig,
}));
vi.mock('../../src/core/adapters/index.js', () => ({
  getAdapter: mockGetAdapter,
}));

describe('attachEventNotifications', () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockDispatch.mockResolvedValue(undefined);
    mockGetPausedPipelineIdForBudget.mockReset();
    mockGetPausedPipelineIdForBudget.mockReturnValue(undefined);
    mockGetRun.mockReset();
    mockGetRun.mockReturnValue(null);
    mockResolveRuntimeConfig.mockReset();
    mockResolveRuntimeConfig.mockReturnValue({ tools: [] });
    mockGetAdapter.mockReset();
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

  it('builds reply_markup with one button per option for stage:request-created input with options', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('stage:request-created', {
      requestId: 42,
      pipelineId: 1,
      featureId: 'feat-9',
      stage: 'specify',
      kind: 'input',
      prompt: 'Qual estrategia de cache?',
      options: ['Cache em memoria', 'Cache em SQLite'],
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'stage:input',
      'metal-squad: feat-9 needs human input at stage specify\nQual estrategia de cache?',
      {
        requestId: 42,
        featureId: 'feat-9',
        stage: 'specify',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Cache em memoria', callback_data: 'input:42:0' }],
            [{ text: 'Cache em SQLite', callback_data: 'input:42:1' }],
          ],
        },
      },
    );

    detach();
  });

  it('omits the "Reply: input:<id> <text>" line when options are present', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('stage:request-created', {
      requestId: 42,
      pipelineId: 1,
      featureId: 'feat-9',
      stage: 'specify',
      kind: 'input',
      prompt: 'Qual estrategia de cache?',
      options: ['A', 'B'],
    });

    const message = mockDispatch.mock.calls[0]?.[1] as string;
    expect(message).not.toContain('Reply: input:');

    detach();
  });

  it('falls back to free-text format (no reply_markup) when options are absent', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('stage:request-created', {
      requestId: 7,
      pipelineId: 1,
      featureId: 'feat-9',
      stage: 'specify',
      kind: 'input',
      prompt: 'What should we name this?',
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'stage:input',
      'metal-squad: feat-9 needs human input at stage specify\nWhat should we name this?\nReply: input:7 <text>',
      {
        requestId: 7,
        featureId: 'feat-9',
        stage: 'specify',
      },
    );

    detach();
  });

  it('does not invent options for kind:approval requests (regression — US2)', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('stage:request-created', {
      requestId: 3,
      pipelineId: 1,
      featureId: 'feat-9',
      stage: 'specify',
      kind: 'approval',
      prompt: 'metal-squad: feat-9 completed stage "specify"',
      source: 'manual',
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'stage:approval',
      expect.any(String),
      expect.objectContaining({
        requestId: 3,
        featureId: 'feat-9',
        stage: 'specify',
        source: 'manual',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Advance', callback_data: 'stage:3 advance' },
            { text: '🔄 Retry', callback_data: 'stage:3 retry' },
            { text: '⏸ Hold', callback_data: 'stage:3 hold' },
          ]],
        },
      }),
    );

    detach();
  });

  it('dispatches timeout approval notifications with retry and keep-blocked actions', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('timeout:approval-created', {
      requestId: 77,
      occurrenceId: 19,
      runId: 31,
      pipelineId: 5,
      featureId: 'feat-timeout',
      stage: 'implement',
      timeoutMs: 600_000,
      runtimeMs: 605_000,
      lastProgress: 'waiting for publish verification',
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'timeout:approval-created',
      expect.stringContaining('feat-timeout stage implement timed out'),
      expect.objectContaining({
        requestId: 77,
        occurrenceId: 19,
        runId: 31,
        timeoutApprovalRequestId: 77,
        featureId: 'feat-timeout',
        stage: 'implement',
        reply_markup: {
          inline_keyboard: [[
            { text: '🔄 Retry', callback_data: 'timeout:77 retry' },
            { text: '⏸ Keep blocked', callback_data: 'timeout:77 keep_blocked' },
          ]],
        },
      }),
    );

    detach();
  });

  it('dispatches human run:blocked notifications with approval and intervention buttons', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('run:blocked', {
      runId: 31,
      featureId: 'feat-blocked',
      tool: 'codex',
      reason: 'gate',
      code: 'dependency_unavailable',
      summary: 'The dependency service is unavailable.',
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'run:blocked',
      expect.stringContaining('dependency_unavailable'),
      expect.objectContaining({
        runId: 31,
        featureId: 'feat-blocked',
        reason: 'gate',
        code: 'dependency_unavailable',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Aprovar avanço', callback_data: 'blocked:approve:31' },
            { text: '🛠 Intervir', callback_data: 'blocked:intervene:31' },
          ]],
        },
      }),
    );

    detach();
  });

  it('does not dispatch protective run:blocked outcomes', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('run:blocked', {
      runId: 32,
      featureId: 'feat-budget',
      tool: 'codex',
      reason: 'budget',
      summary: 'Budget limit reached.',
    });

    expect(mockDispatch).not.toHaveBeenCalled();

    detach();
  });

  it('uses the blocked reason when run:blocked has no code', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('run:blocked', {
      runId: 33,
      featureId: 'feat-input',
      tool: 'codex',
      reason: 'needs_input',
      summary: 'A response is needed.',
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'run:blocked',
      expect.stringContaining('Blocked: needs_input'),
      expect.objectContaining({ runId: 33, reason: 'needs_input' }),
    );

    detach();
  });

  it('adds a resume button to budget alerts when a paused pipeline exists', async () => {
    mockGetPausedPipelineIdForBudget.mockReturnValue(14);
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('budget:alert', {
      percent: 85,
      spent: 850,
      limit: 1000,
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'budget:alert',
      'metal-squad: budget 85% reached (850/1000)',
      expect.objectContaining({
        reply_markup: {
          inline_keyboard: [[
            { text: '▶️ Resume Pipeline', callback_data: 'resume_pipeline:14' },
          ]],
        },
      }),
    );

    detach();
  });

  it('dispatches a generic run:failed notification for non-session-limit failures', async () => {
    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('run:failed', {
      runId: 7,
      featureId: 'feat-9',
      tool: 'codex',
      error: 'timeout após 605s',
      kind: 'execution',
      pipelineId: 9,
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'run:failed',
      'metal-squad: feat-9 failed — timeout após 605s',
      expect.objectContaining({
        featureId: 'feat-9',
        runId: 7,
        pipelineId: 9,
        error: 'timeout após 605s',
      }),
    );

    detach();
  });

  it('builds a session-limit aware run:failed message with available tools and resume buttons', async () => {
    mockResolveRuntimeConfig.mockReturnValue({
      tools: [
        { id: 'codex' },
        { id: 'claude' },
        { id: 'opencode' },
      ],
    });
    mockGetAdapter.mockImplementation((tool: string) => ({
      isAvailable: () => tool !== 'opencode',
    }));

    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('run:failed', {
      runId: 7,
      featureId: 'feat-9',
      tool: 'codex',
      error: 'session limit reached: session limit',
      kind: 'execution',
      pipelineId: 9,
      blocked: true,
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'run:failed',
      expect.stringContaining('adapter codex hit session limit'),
      expect.objectContaining({
        featureId: 'feat-9',
        runId: 7,
        pipelineId: 9,
        reply_markup: {
          inline_keyboard: [[
            { text: 'Resume with claude', callback_data: 'resume_override:9:claude' },
          ]],
        },
      }),
    );

    detach();
  });

  it('falls back to a textual suggestion when no other tool is available for session limit', async () => {
    mockResolveRuntimeConfig.mockReturnValue({
      tools: [{ id: 'codex' }],
    });
    mockGetAdapter.mockReturnValue({ isAvailable: () => true });

    const { attachEventNotifications } = await import('../../src/core/events/notifications.js');
    const eventBus = createMsqEventBus();
    const detach = attachEventNotifications(eventBus);

    eventBus.emit('run:failed', {
      runId: 7,
      featureId: 'feat-9',
      tool: 'codex',
      error: 'session limit reached: session limit',
      kind: 'execution',
      pipelineId: 9,
      blocked: true,
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      'run:failed',
      expect.stringContaining('msq resume 9 --tool <adapter>'),
      expect.objectContaining({
        featureId: 'feat-9',
        runId: 7,
        pipelineId: 9,
      }),
    );

    const metadata = mockDispatch.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(metadata?.reply_markup).toBeUndefined();

    detach();
  });
});
