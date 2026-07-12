import type { Effort, Feature, Tool } from '../backlog/schema.js';

export interface TokenUsage {
  input: number;
  cachedInput?: number;
  output: number;
  total: number;
}

export interface RunControlNeedsInput {
  type: 'needs_input';
  prompt: string;
  options?: string[];
}

export type RunControl = RunControlNeedsInput;

export interface SessionHandle {
  tool: Tool;
  sessionId: string;
  capturedFromRunId: number;
  capturedAt: string;
}

export type SessionReuseMode = 'new' | 'resume';

export interface RunFeatureOptions {
  cwd: string;
  runId: number;
  signal?: AbortSignal;
  session?: {
    mode: SessionReuseMode;
    handle?: SessionHandle;
  };
}

export interface RunResult {
  ok: boolean;
  summary: string;
  usage?: TokenUsage;
  control?: RunControl;
  aborted?: boolean;
  session?: SessionHandle | null;
}

export interface ToolAdapter {
  readonly tool: Tool;
  /** Mapeia effort normalizado para a flag nativa da ferramenta. */
  effortFlag(effort: Effort): string[];
  /** Executa uma fase spec-kit para a feature com o prompt já construído. */
  runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult>;
  /** Extrai uso de tokens do transcript, se disponível. */
  parseUsage?(transcript: string): TokenUsage | null;
  /** Verifica de forma rápida e síncrona se o binário desta ferramenta está disponível no ambiente atual. */
  isAvailable?(): boolean;
}
