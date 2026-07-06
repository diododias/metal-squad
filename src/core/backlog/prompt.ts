import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Feature } from './schema.js';
import type { Skill } from '../skills/types.js';

function renderTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

const FALLBACK_IMPLEMENT: Skill = {
  name: 'implement',
  source: 'builtin',
  promptTemplate: 'Execute the implementation workflow for {{featureId}} ({{featureTitle}}).{{spec}}{{context}}',
  metadata: { description: 'Default implementation workflow (fallback).', outputs: ['code'] },
};

export function buildPrompt(feature: Feature, skills: Skill[], cwd = process.cwd()): string {
  const specContent = feature.specFile
    ? readFileSync(resolve(cwd, feature.specFile), 'utf8')
    : null;

  const contextContent = (feature.context ?? [])
    .filter((f) => existsSync(resolve(cwd, f)))
    .map((f) => `--- ${f} ---\n${readFileSync(resolve(cwd, f), 'utf8')}`)
    .join('\n\n');

  const effectiveSkills = skills.length > 0 ? skills : [FALLBACK_IMPLEMENT];

  const skillPrompts = effectiveSkills.map((s) => {
    const inputs = s.metadata.inputs;
    const vars: Record<string, string | null | undefined> = {
      featureId: feature.id,
      featureTitle: feature.title,
    };
    if (!inputs || inputs.includes('specFile')) vars.spec = specContent ? `\n\n${specContent}` : null;
    if (!inputs || inputs.includes('context')) vars.context = contextContent ? `\n\n${contextContent}` : null;
    return renderTemplate(s.promptTemplate, vars);
  });

  return skillPrompts.join('\n\n---\n\n');
}

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
