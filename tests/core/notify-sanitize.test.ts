import { describe, expect, it } from 'vitest';
import { sanitizeNotificationMessage } from '../../src/core/notify/sanitize.js';

const CWD = '/Users/dev/repos/metal-squad';
const HOME = '/Users/dev';

function sanitize(message: string): string {
  return sanitizeNotificationMessage(message, CWD, HOME);
}

describe('sanitizeNotificationMessage', () => {
  it('converts a path under cwd to a relative path', () => {
    const out = sanitize(`arquivos tocados: ${CWD}/src/ui/App.tsx`);
    expect(out).toBe('arquivos tocados: src/ui/App.tsx');
    expect(out).not.toContain('/Users/dev');
  });

  it('hides the home directory and username for paths outside the checkout', () => {
    const out = sanitize(`wrote ${HOME}/secret/project/file.ts`);
    expect(out).not.toContain('/Users/dev');
    expect(out).toContain('secret/project/file.ts');
  });

  it('keeps only the last segments for arbitrary absolute paths', () => {
    const out = sanitize('opened /var/folders/tmp/a/b/c/d/report.md now');
    expect(out).toContain('c/d/report.md');
    expect(out).not.toContain('/var/folders');
  });

  it('preserves trailing punctuation outside the path', () => {
    const out = sanitize(`done at ${CWD}/docs/features/F30.md.`);
    expect(out).toBe('done at docs/features/F30.md.');
  });

  it('handles multiple paths and leaves relative paths untouched', () => {
    const out = sanitize(`touched ${CWD}/a.ts and src/b.ts`);
    expect(out).toBe('touched a.ts and src/b.ts');
  });

  it('is a no-op for empty input', () => {
    expect(sanitize('')).toBe('');
  });
});
