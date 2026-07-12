import { describe, it, expect } from 'vitest';
import { parseControlSignal } from '../../src/core/adapters/control.js';

describe('parseControlSignal', () => {
  it('returns undefined for empty string', () => {
    expect(parseControlSignal('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only string', () => {
    expect(parseControlSignal('   ')).toBeUndefined();
  });

  it('returns undefined when prefix not found', () => {
    expect(parseControlSignal('regular output text')).toBeUndefined();
    expect(parseControlSignal('some output\nmore output')).toBeUndefined();
  });

  it('returns undefined when prefix has no prompt after it', () => {
    expect(parseControlSignal('MSQ_INPUT_REQUIRED:')).toBeUndefined();
    expect(parseControlSignal('MSQ_INPUT_REQUIRED:   ')).toBeUndefined();
  });

  it('parses prompt from signal at end of text', () => {
    const result = parseControlSignal('MSQ_INPUT_REQUIRED:Enter your choice');
    expect(result).toEqual({ type: 'needs_input', prompt: 'Enter your choice' });
  });

  it('trims whitespace from prompt', () => {
    const result = parseControlSignal('MSQ_INPUT_REQUIRED:  Enter value  ');
    expect(result?.prompt).toBe('Enter value');
  });

  it('uses last occurrence of prefix when multiple present', () => {
    const text = 'MSQ_INPUT_REQUIRED:first\nMSQ_INPUT_REQUIRED:second prompt';
    const result = parseControlSignal(text);
    expect(result?.prompt).toBe('second prompt');
  });

  it('handles prefix embedded in larger output', () => {
    const text = 'Tool output line\nAnother line\nMSQ_INPUT_REQUIRED:What is the value?';
    const result = parseControlSignal(text);
    expect(result).toEqual({ type: 'needs_input', prompt: 'What is the value?' });
  });

  it('returns needs_input type always', () => {
    const result = parseControlSignal('MSQ_INPUT_REQUIRED:something');
    expect(result?.type).toBe('needs_input');
  });

  it('handles null/undefined input gracefully', () => {
    // null is coerced to '' via String(text ?? '')
    expect(parseControlSignal(null as unknown as string)).toBeUndefined();
  });

  it('handles prompt with colons', () => {
    const result = parseControlSignal('MSQ_INPUT_REQUIRED:Enter value (format: key:value)');
    expect(result?.prompt).toBe('Enter value (format: key:value)');
  });

  it('handles multiline prompts', () => {
    const result = parseControlSignal('MSQ_INPUT_REQUIRED:Line1\nLine2\nLine3');
    expect(result?.prompt).toBe('Line1\nLine2\nLine3');
  });

  describe('OPTIONS: block — valid extraction', () => {
    it('extracts options and strips the OPTIONS: block from prompt', () => {
      const text = [
        'MSQ_INPUT_REQUIRED: Qual estrategia de cache devemos usar?',
        'OPTIONS:',
        '- Cache em memoria',
        '- Cache em SQLite',
        '- Sem cache por enquanto',
      ].join('\n');
      const result = parseControlSignal(text);
      expect(result).toEqual({
        type: 'needs_input',
        prompt: 'Qual estrategia de cache devemos usar?',
        options: ['Cache em memoria', 'Cache em SQLite', 'Sem cache por enquanto'],
      });
    });

    it('preserves option order', () => {
      const text = 'MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n- Third\n- First\n- Second';
      const result = parseControlSignal(text);
      expect(result?.options).toEqual(['Third', 'First', 'Second']);
    });

    it('is case-insensitive for the OPTIONS: marker', () => {
      const text = 'MSQ_INPUT_REQUIRED: pick one\noptions:\n- A\n- B';
      const result = parseControlSignal(text);
      expect(result?.options).toEqual(['A', 'B']);
    });

    it('accepts exactly 1 option', () => {
      const text = 'MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n- Only option';
      const result = parseControlSignal(text);
      expect(result?.options).toEqual(['Only option']);
    });

    it('accepts exactly 8 options', () => {
      const labels = Array.from({ length: 8 }, (_, i) => `Option ${String(i + 1)}`);
      const text = `MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n${labels.map((l) => `- ${l}`).join('\n')}`;
      const result = parseControlSignal(text);
      expect(result?.options).toEqual(labels);
    });

    it('ignores blank lines between option lines', () => {
      const text = 'MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n- A\n\n- B\n';
      const result = parseControlSignal(text);
      expect(result?.options).toEqual(['A', 'B']);
    });

    it('stops collecting at the first non-option line', () => {
      const text = 'MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n- A\n- B\nnot an option\n- C';
      const result = parseControlSignal(text);
      expect(result?.options).toEqual(['A', 'B']);
    });
  });

  describe('H19 — unmarked clarification question fallback', () => {
    it('detects a trailing clarification question without the marker', () => {
      const text = 'I reviewed the spec.\n\nShould I proceed with approach A or approach B?';
      const result = parseControlSignal(text);
      expect(result).toEqual({
        type: 'needs_input',
        prompt: 'Should I proceed with approach A or approach B?',
      });
    });

    it('detects "could you" clarification phrasing', () => {
      const text = 'Could you clarify which module owns this validation?';
      const result = parseControlSignal(text);
      expect(result?.type).toBe('needs_input');
      expect(result?.prompt).toBe(text);
    });

    it('does not trigger on a rhetorical question in a completed summary', () => {
      const text = 'All tests pass and the feature is complete. Should this be revisited later?';
      expect(parseControlSignal(text)).toBeUndefined();
    });

    it('does not trigger when the trailing paragraph does not end in "?"', () => {
      const text = 'Should I proceed with approach A or approach B.';
      expect(parseControlSignal(text)).toBeUndefined();
    });

    it('does not trigger when the question paragraph exceeds the length cap', () => {
      const question = `Should I proceed with ${'x'.repeat(300)}?`;
      expect(parseControlSignal(question)).toBeUndefined();
    });

    it('prefers the exact MSQ_INPUT_REQUIRED marker over the fallback heuristic', () => {
      const text = 'Should I proceed with approach A?\n\nMSQ_INPUT_REQUIRED: Pick a cache strategy';
      const result = parseControlSignal(text);
      expect(result?.prompt).toBe('Pick a cache strategy');
    });
  });

  describe('OPTIONS: block — invalid falls back to free text', () => {
    it('falls back when there is no "-" line after OPTIONS:', () => {
      const text = 'MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\nnothing here';
      const result = parseControlSignal(text);
      expect(result?.options).toBeUndefined();
      expect(result?.prompt).toBe('pick one\nOPTIONS:\nnothing here');
    });

    it('falls back when there are more than 8 options', () => {
      const labels = Array.from({ length: 9 }, (_, i) => `Option ${String(i + 1)}`);
      const text = `MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n${labels.map((l) => `- ${l}`).join('\n')}`;
      const result = parseControlSignal(text);
      expect(result?.options).toBeUndefined();
      expect(result?.prompt).toBe(text.slice('MSQ_INPUT_REQUIRED:'.length).trim());
    });

    it('falls back when a label is empty', () => {
      const text = 'MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n- \n- B';
      const result = parseControlSignal(text);
      expect(result?.options).toBeUndefined();
    });

    it('falls back when a label exceeds 60 characters', () => {
      const longLabel = 'x'.repeat(61);
      const text = `MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n- ${longLabel}\n- B`;
      const result = parseControlSignal(text);
      expect(result?.options).toBeUndefined();
    });

    it('accepts a label at exactly 60 characters', () => {
      const label = 'x'.repeat(60);
      const text = `MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n- ${label}`;
      const result = parseControlSignal(text);
      expect(result?.options).toEqual([label]);
    });

    it('falls back when labels are duplicated', () => {
      const text = 'MSQ_INPUT_REQUIRED: pick one\nOPTIONS:\n- Same\n- Same';
      const result = parseControlSignal(text);
      expect(result?.options).toBeUndefined();
      expect(result?.prompt).toBe('pick one\nOPTIONS:\n- Same\n- Same');
    });
  });
});
