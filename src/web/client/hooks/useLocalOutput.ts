import { useCallback, useState } from 'react';

export interface OutputLine {
  id?: number;
  runId: number;
  tool?: string;
  source?: string;
  line: string;
  createdAt?: string;
  toolName?: string;
  level?: 'error' | 'warn';
  [key: string]: unknown;
}

export function normalizeLegacyOpencodePayload(payload: OutputLine): OutputLine | null {
  if (payload.tool !== 'opencode' || typeof payload.line !== 'string') return payload;
  const line = payload.line.trim();
  if (!line.startsWith('{"type":')) return payload;

  const rawTypeMatch = /"type":"([^"]+)"/.exec(line);
  const rawToolMatch = /"tool":"([^"]+)"/.exec(line);
  const rawTextMatch = /"text":"([^"]+)"/.exec(line);
  const rawReasoningMatch = /"reasoning":"([^"]+)"/.exec(line);
  const rawType = rawTypeMatch?.[1] ?? '';
  const rawTool = rawToolMatch?.[1] ?? '';
  const rawText = rawTextMatch?.[1] ?? '';
  const rawReasoning = rawReasoningMatch?.[1] ?? '';

  if (rawType === 'tool_use' && rawTool) return { ...payload, source: 'tool', line: `tool ${rawTool}` };
  if (rawType === 'thinking' && rawReasoning) return { ...payload, source: 'agent', line: `[thinking] ${rawReasoning}` };
  if (rawType === 'text' && rawText) return { ...payload, source: 'agent', line: rawText };
  if (rawType === 'step_start' || rawType === 'step_finish') return null;
  if (rawType === 'tool_use') return null;
  if (rawType === 'text') return null;
  return payload;
}

export interface UseLocalOutputResult {
  linesByRun: Record<number, OutputLine[]>;
  append: (runId: number, line: OutputLine) => void;
  clear: (runId: number) => void;
}

export function useLocalOutput(): UseLocalOutputResult {
  const [linesByRun, setLinesByRun] = useState<Record<number, OutputLine[]>>({});

  const append = useCallback((runId: number, line: OutputLine) => {
    // Structured tool-call messages own provider normalization. Keep this
    // buffer limited to ordinary output; the exported legacy normalizer is
    // retained only for old history consumers and migration tests.
    const normalizedLine = line;
    setLinesByRun((current) => {
      const existing = current[runId] ?? [];
      if (normalizedLine.id != null) {
        for (let i = existing.length - 1; i >= 0 && i >= existing.length - 16; i -= 1) {
          if (existing[i]?.id === normalizedLine.id) return current;
        }
      }
      return { ...current, [runId]: [...existing, normalizedLine].slice(-500) };
    });
  }, []);

  const clear = useCallback((runId: number) => {
    setLinesByRun((current) => ({ ...current, [runId]: [] }));
  }, []);

  return { linesByRun, append, clear };
}
