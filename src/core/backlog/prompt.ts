import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Feature } from './schema.js';

export function buildSpecKitPrompt(feature: Feature, cwd = process.cwd()): string {
  const lines = [
    `Rode o fluxo spec-kit para a feature "${feature.id}" (${feature.title}).`,
    `Execute /speckit.implement usando spec, plan e tasks já gerados no repo.`,
    `Implemente apenas o escopo desta feature, faça commits atômicos por task e`,
    `ao final devolva um resumo de 1-2 linhas do que foi entregue.`,
  ];

  if (feature.spec) lines.push(`Contexto adicional: ${feature.spec}`);

  if (feature.specFile) {
    const abs = resolve(cwd, feature.specFile);
    if (existsSync(abs)) {
      lines.push(`\nSpec detalhada (${feature.specFile}):\n${readFileSync(abs, 'utf8')}`);
    }
  }

  if (feature.skills && feature.skills.length > 0) {
    lines.push(`\nSkills: ${feature.skills.join(', ')}`);
  }

  if (feature.context && feature.context.length > 0) {
    lines.push(`\nArquivos de contexto:`);
    for (const ctx of feature.context) {
      const abs = resolve(cwd, ctx);
      if (existsSync(abs)) {
        lines.push(`--- ${ctx} ---\n${readFileSync(abs, 'utf8')}`);
      }
    }
  }

  return lines.join('\n');
}
