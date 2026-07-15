import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..', '..');

describe('agent skill shims', () => {
  it('keeps dev-flow shim pointed at the canonical .claude skill', () => {
    const shim = readFileSync(resolve(repoRoot, '.agents/skills/dev-flow/SKILL.md'), 'utf8');

    expect(shim).toContain('../../../.claude/skills/dev-flow/SKILL.md');
    expect(shim).toContain('compatibilidade com discovery legado');
    expect(shim).not.toContain('## Fluxo padrao');
  });

  it('keeps msq-develop shim pointed at the canonical .claude skill', () => {
    const shim = readFileSync(resolve(repoRoot, '.agents/skills/msq-develop/SKILL.md'), 'utf8');

    expect(shim).toContain('../../../.claude/skills/msq-develop/SKILL.md');
    expect(shim).toContain('compatibilidade com discovery legado');
    expect(shim).not.toContain('### 4. Executar msq run');
  });
});
