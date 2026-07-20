import { DATA_DIR } from '../../config/index.js';
import type { LogLevel } from './levels.js';
import { shouldLog } from './levels.js';
import { errorToMessageAndStack, type LogEntry } from './format.js';
import { ConsoleTransport, FileTransport, dateBasedLogPath, type Transport } from './transports.js';

export type { LogLevel } from './levels.js';
export type { LogEntry } from './format.js';

export interface LoggerOptions {
  module: string;
}

export interface LoggerConfig {
  level: LogLevel;
  transports: Transport[];
}

const currentConfig: LoggerConfig = {
  level: 'info',
  transports: [new ConsoleTransport()],
};

let fileTransport: FileTransport | null = null;

export function configureLogger(config: Partial<Pick<LoggerConfig, 'level'>> & { logFilePath?: string }): void {
  if (config.level) {
    currentConfig.level = config.level;
  }

  if (config.logFilePath !== undefined) {
    fileTransport = null;
    if (config.logFilePath) {
      fileTransport = new FileTransport(config.logFilePath);
    }
    currentConfig.transports = [new ConsoleTransport(), ...(fileTransport ? [fileTransport] : [])];
  } else if (!fileTransport) {
    // Enable default file transport on first configure (unless explicitly disabled)
    enableDefaultFileTransport();
  }
}

let fileTransportEnabled = false;

function enableDefaultFileTransport(): void {
  if (fileTransportEnabled) return;
  fileTransportEnabled = true;
  try {
    const path = dateBasedLogPath(DATA_DIR);
    fileTransport = new FileTransport(path);
    currentConfig.transports = [new ConsoleTransport(), fileTransport];
  } catch {
    // file transport is best-effort; console-only is fine
  }
}

export function setLogLevel(level: LogLevel): void {
  currentConfig.level = level;
}

export class Logger {
  private readonly module: string;

  public constructor(module: string) {
    this.module = module;
  }

  public error(message: string, error?: unknown): void {
    this.log('error', message, error);
  }

  public warn(message: string, error?: unknown): void {
    this.log('warn', message, error);
  }

  public info(message: string): void {
    this.log('info', message);
  }

  public debug(message: string, error?: unknown): void {
    this.log('debug', message, error);
  }

  private log(level: LogLevel, message: string, error?: unknown): void {
    if (!shouldLog(level, currentConfig.level)) return;

    const { message: errorMessage, stack } = error ? errorToMessageAndStack(error) : { message: '' };
    const fullMessage = error ? `${message}: ${errorMessage}` : message;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module: this.module,
      message: fullMessage,
      ...(stack ? { errorStack: stack } : {}),
    };

    for (const transport of currentConfig.transports) {
      transport.write(entry);
    }
  }

  public child(suffix: string): Logger {
    return new Logger(`${this.module}/${suffix}`);
  }
}

const loggers = new Map<string, Logger>();

export function createLogger(module: string): Logger {
  const cached = loggers.get(module);
  if (cached) return cached;
  const logger = new Logger(module);
  loggers.set(module, logger);
  return logger;
}

export { createLogger as getLogger };
