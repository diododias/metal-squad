import { RUN_BLOCKED_CODES, type RunBlockedCode, type RunControl } from './types.js';

const INPUT_REQUIRED_PREFIX = 'MSQ_INPUT_REQUIRED:';
const DONE_PREFIX = 'MSQ_DONE:';
const BLOCKED_PREFIX = 'MSQ_BLOCKED:';
const PR_LINE = /^pr_url=(\S+)\s+pr_number=(\d+)\s+base=(\S+)\s+head=(\S+)\s*$/m;
const OPTIONS_MARKER = /^options:\s*$/i;
const OPTION_LINE = /^-\s+(.+)$/;
const MAX_OPTIONS = 8;
const MAX_LABEL_LENGTH = 60;

// H19: models sometimes ask a genuine clarification question in plain
// language without the exact MSQ_INPUT_REQUIRED marker. Left undetected,
// that output looks like a completed stage and gets auto-advanced through
// an approval gate instead of being routed to the admin as a question. This
// pattern only catches unambiguous clarification phrasing to avoid treating
// a rhetorical closing remark in a completed summary as a stuck question.
const MAX_FALLBACK_QUESTION_LENGTH = 300;
const CLARIFICATION_QUESTION_PATTERN =
  /\b(could you|can you|should i|should we|do you want|would you like|which (?:of|one|option)|what (?:should|would)|please (?:clarify|confirm)|i need (?:clarification|your input|to confirm)|need clarification|voce (?:pode|podia|poderia|quer|queria)|voc[eê] (?:pode|podia|poderia|quer|queria)|(?:devo|devemos|posso|podemos) (?:prosseguir|fazer|criar|abrir|usar|seguir|continuar)|quer que eu (?:faca|fa[cç]a|prossiga|siga)|preciso (?:de |da |de )?clarifica[cç][aã]o|qual (?:devo|devemos|usar)|como (?:devo|devemos) (?:prosseguir|fazer|seguir))\b/i;
const BLOCKED_FALLBACK_PATTERN =
  /\b(cannot proceed|blocked|dependency not found|unable to continue)\b/i;

export function parseControlSignal(text: string | null | undefined): RunControl | undefined {
  if (!text) return undefined;
  const normalized = text.trim();
  if (!normalized) return undefined;

  const signal = findLastTypedSignal(normalized);
  if (signal) {
    return parseTypedSignal(signal.prefix, normalized.slice(signal.index + signal.prefix.length).trim());
  }

  const fallbackPrompt = detectUnmarkedClarificationQuestion(normalized);
  if (fallbackPrompt) return { type: 'needs_input', prompt: fallbackPrompt };

  if (BLOCKED_FALLBACK_PATTERN.test(normalized)) {
    return { type: 'blocked', code: 'precondition_failed', reason: normalized };
  }

  return undefined;
}

function findLastTypedSignal(text: string): { prefix: string; index: number } | undefined {
  return [INPUT_REQUIRED_PREFIX, DONE_PREFIX, BLOCKED_PREFIX]
    .map((prefix) => ({ prefix, index: text.lastIndexOf(prefix) }))
    .filter((signal) => signal.index !== -1)
    .sort((a, b) => b.index - a.index)[0];
}

function parseTypedSignal(prefix: string, raw: string): RunControl | undefined {
  if (prefix === INPUT_REQUIRED_PREFIX) {
    if (!raw) return undefined;
    const options = extractOptions(raw);
    if (!options) return { type: 'needs_input', prompt: raw };
    return { type: 'needs_input', prompt: options.prompt, options: options.labels };
  }

  if (prefix === DONE_PREFIX) {
    const publicationMatch = PR_LINE.exec(raw);
    const summary = publicationMatch ? raw.slice(0, publicationMatch.index).trim() : raw;
    if (!publicationMatch) return { type: 'done', summary };
    return {
      type: 'done',
      summary,
      publication: {
        prUrl: publicationMatch[1] ?? '',
        prNumber: Number(publicationMatch[2]),
        base: publicationMatch[3] ?? '',
        head: publicationMatch[4] ?? '',
      },
    };
  }

  const [rawCode, ...reasonParts] = raw.split('|');
  const code = rawCode?.trim();
  const reason = reasonParts.join('|').trim();
  if (isRunBlockedCode(code)) return { type: 'blocked', code, reason };

  const detail = raw || 'No block reason was provided.';
  return {
    type: 'blocked',
    code: 'precondition_failed',
    reason: `${detail}\n[Invalid or missing MSQ_BLOCKED reason code; defaulted to precondition_failed.]`,
  };
}

function isRunBlockedCode(code: string | undefined): code is RunBlockedCode {
  return Boolean(code && RUN_BLOCKED_CODES.includes(code as RunBlockedCode));
}

function detectUnmarkedClarificationQuestion(text: string): string | undefined {
  const lastParagraph = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .pop();
  if (!lastParagraph) return undefined;
  if (!lastParagraph.endsWith('?')) return undefined;
  if (lastParagraph.length > MAX_FALLBACK_QUESTION_LENGTH) return undefined;
  if (!CLARIFICATION_QUESTION_PATTERN.test(lastParagraph)) return undefined;
  return lastParagraph;
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
