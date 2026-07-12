import type { RunControl } from './types.js';

const INPUT_REQUIRED_PREFIX = 'MSQ_INPUT_REQUIRED:';
const OPTIONS_MARKER = /^options:\s*$/i;
const OPTION_LINE = /^-\s+(.+)$/;
const MAX_OPTIONS = 8;
const MAX_LABEL_LENGTH = 60;

export function parseControlSignal(text: string | null | undefined): RunControl | undefined {
  if (!text) return undefined;
  const normalized = text.trim();
  if (!normalized) return undefined;

  const index = normalized.lastIndexOf(INPUT_REQUIRED_PREFIX);
  if (index === -1) return undefined;

  const raw = normalized.slice(index + INPUT_REQUIRED_PREFIX.length).trim();
  if (!raw) return undefined;

  const options = extractOptions(raw);
  if (!options) return { type: 'needs_input', prompt: raw };

  return { type: 'needs_input', prompt: options.prompt, options: options.labels };
}

function extractOptions(raw: string): { prompt: string; labels: string[] } | undefined {
  const lines = raw.split('\n');
  const markerIndex = lines.findIndex((line) => OPTIONS_MARKER.test(line.trim()));
  if (markerIndex === -1) return undefined;

  const labels: string[] = [];
  for (let i = markerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '') continue;
    const match = OPTION_LINE.exec(line);
    if (!match) break;
    labels.push((match[1] ?? '').trim());
  }

  if (!isValidOptionsBlock(labels)) return undefined;

  return { prompt: lines.slice(0, markerIndex).join('\n').trim(), labels };
}

function isValidOptionsBlock(labels: string[]): boolean {
  if (labels.length < 1 || labels.length > MAX_OPTIONS) return false;
  const seen = new Set<string>();
  for (const label of labels) {
    if (label.length < 1 || label.length > MAX_LABEL_LENGTH) return false;
    if (seen.has(label)) return false;
    seen.add(label);
  }
  return true;
}
