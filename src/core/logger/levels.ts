export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function shouldLog(messageLevel: LogLevel, threshold: LogLevel): boolean {
  return LOG_LEVEL_RANK[messageLevel] <= LOG_LEVEL_RANK[threshold];
}
