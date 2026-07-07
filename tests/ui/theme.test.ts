import { describe, expect, it } from 'vitest';
import { BUILTIN_THEMES } from '../../src/ui/theme/builtins.js';
import { getBuiltinThemeNames, resolveThemePreference } from '../../src/ui/theme/resolve.js';
import { THEME_ROLE_NAMES } from '../../src/ui/theme/types.js';

describe('theme system', () => {
  it('exposes the four built-in theme names', () => {
    expect(getBuiltinThemeNames()).toEqual(['default', 'dark', 'light', 'minimal']);
  });

  it('gives every built-in theme the full semantic role set', () => {
    for (const theme of Object.values(BUILTIN_THEMES)) {
      for (const role of THEME_ROLE_NAMES) {
        expect(theme.roles[role]).toBeDefined();
      }

      expect(theme.statusRoleByRun.running).toBeDefined();
      expect(theme.statusRoleByRun.done).toBeDefined();
      expect(theme.statusRoleByRun.failed).toBeDefined();
      expect(theme.statusRoleByRun.blocked).toBeDefined();
      expect(theme.statusRoleByRun.aborted).toBeDefined();
    }
  });

  it('resolves a supported configured theme directly', () => {
    const resolution = resolveThemePreference('dark');
    expect(resolution.active).toBe('dark');
    expect(resolution.fallbackReason).toBeNull();
    expect(resolution.message).toBeNull();
  });

  it('falls back to default when the preference is missing', () => {
    const resolution = resolveThemePreference(undefined);
    expect(resolution.active).toBe('default');
    expect(resolution.fallbackReason).toBe('missing');
    expect(resolution.message).toBeNull();
  });

  it('falls back to default and emits a readable message for unknown themes', () => {
    const resolution = resolveThemePreference('solarized');
    expect(resolution.active).toBe('default');
    expect(resolution.fallbackReason).toBe('unknown');
    expect(resolution.message).toContain('solarized');
    expect(resolution.message).toContain('default');
  });

  it('keeps the minimal theme readable with emphasis-based roles', () => {
    const minimal = BUILTIN_THEMES.minimal;
    expect(minimal.surface.borderColor).toBe('gray');
    expect(minimal.roles.focus.inverse || minimal.roles.focus.bold).toBe(true);
    expect(minimal.roles.error.inverse || minimal.roles.error.color).toBeTruthy();
  });
});
