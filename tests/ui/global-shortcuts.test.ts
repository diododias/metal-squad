import { describe, expect, it, vi } from 'vitest';
import { createGlobalShortcuts } from '../../src/ui/commands/globalShortcuts.js';

function makeOptions(overrides: Partial<Parameters<typeof createGlobalShortcuts>[0]> = {}) {
  return {
    canNavigateRuns: false,
    canNavigateGates: false,
    canMovePending: true,
    movePrevious: vi.fn(),
    moveNext: vi.fn(),
    enter: vi.fn(),
    escape: vi.fn(),
    cycleFocus: vi.fn(),
    quit: vi.fn(),
    ...overrides,
  };
}

describe('createGlobalShortcuts arrow navigation', () => {
  it('binds arrow up/down alongside j/k', () => {
    const shortcuts = createGlobalShortcuts(makeOptions());
    const keys = shortcuts.map((s) => s.key);
    expect(keys).toContain('up');
    expect(keys).toContain('down');
    expect(keys).toContain('j');
    expect(keys).toContain('k');
  });

  it('arrow up moves to the previous item and arrow down to the next', () => {
    const options = makeOptions();
    const shortcuts = createGlobalShortcuts(options);
    const up = shortcuts.find((s) => s.key === 'up');
    const down = shortcuts.find((s) => s.key === 'down');

    up?.action();
    down?.action();

    expect(options.movePrevious).toHaveBeenCalledTimes(1);
    expect(options.moveNext).toHaveBeenCalledTimes(1);
  });

  it('arrow navigation is disabled when nothing is navigable', () => {
    const shortcuts = createGlobalShortcuts(
      makeOptions({ canMovePending: false, canNavigateRuns: false, canNavigateGates: false }),
    );
    const up = shortcuts.find((s) => s.key === 'up');
    expect(up?.condition?.()).toBe(false);
  });

  it('arrow navigation is enabled when the runs panel is navigable', () => {
    const shortcuts = createGlobalShortcuts(
      makeOptions({ canMovePending: false, canNavigateRuns: true }),
    );
    const down = shortcuts.find((s) => s.key === 'down');
    expect(down?.condition?.()).toBe(true);
  });
});
