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
});
