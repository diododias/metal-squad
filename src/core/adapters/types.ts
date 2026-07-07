import type { Effort, Feature, Tool } from '../backlog/schema.js';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface RunControlNeedsInput {
  type: 'needs_input';
  prompt: string;
}

export type RunControl = RunControlNeedsInput;

export interface RunFeatureOptions {
  cwd: string;
  runId: number;
}

export interface RunResult {
  ok: boolean;
  summary: string;
  usage?: TokenUsage;
  control?: RunControl;
}

export interface ToolAdapter {
  readonly tool: Tool;
  /** Mapeia effort normalizado para a flag nativa da ferramenta. */
  effortFlag(effort: Effort): string[];
  /** Executa uma fase spec-kit para a feature com o prompt já construído. */
  runFeature(feature: Feature, prompt: string, opts: RunFeatureOptions): Promise<RunResult>;
  /** Extrai uso de tokens do transcript, se disponível. */
  parseUsage?(transcript: string): TokenUsage | null;
}
