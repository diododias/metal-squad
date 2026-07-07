import type { RunControl } from './types.js';

const INPUT_REQUIRED_PREFIX = 'MSQ_INPUT_REQUIRED:';

export function parseControlSignal(text: string): RunControl | undefined {
  const normalized = String(text ?? '').trim();
  if (!normalized) return undefined;

  const index = normalized.lastIndexOf(INPUT_REQUIRED_PREFIX);
  if (index === -1) return undefined;

  const prompt = normalized.slice(index + INPUT_REQUIRED_PREFIX.length).trim();
  if (!prompt) return undefined;

  return {
    type: 'needs_input',
    prompt,
  };
}
