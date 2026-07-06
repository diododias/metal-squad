import type { Feature } from './schema.js';

/**
 * Monta o prompt que dispara a fase de implementação do spec-kit para a feature.
 * Cada CLI recebe isto em modo headless; os slash commands /speckit.* já ficam
 * instalados no repo (via `specify init`), então o agente relê os artefatos do disco.
 */
export function buildSpecKitPrompt(feature: Feature): string {
  const lines = [
    `Rode o fluxo spec-kit para a feature "${feature.id}" (${feature.title}).`,
    `Execute /speckit.implement usando spec, plan e tasks já gerados no repo.`,
    `Implemente apenas o escopo desta feature, faça commits atômicos por task e`,
    `ao final devolva um resumo de 1-2 linhas do que foi entregue.`,
  ];
  if (feature.spec) lines.push(`Contexto adicional: ${feature.spec}`);
  return lines.join('\n');
}
