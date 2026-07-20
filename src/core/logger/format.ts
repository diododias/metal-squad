import type { LogLevel } from './levels.js';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  runId?: number;
  pipelineId?: number;
  errorStack?: string;
}

export function formatConsole(entry: LogEntry): string {
  const prefix = `[${entry.module}] ${entry.level}:`;
  return `${prefix} ${entry.message}`;
}

export function formatJson(entry: LogEntry): string {
  const { runId, pipelineId } = entry;
  const context: Record<string, unknown> = {};
  if (runId !== undefined) context.runId = runId;
  if (pipelineId !== undefined) context.pipelineId = pipelineId;
  return JSON.stringify(entry);
}

export function errorToMessageAndStack(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
