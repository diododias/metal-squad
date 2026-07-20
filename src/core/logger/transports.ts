import { appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { LogEntry } from './format.js';
import { formatConsole, formatJson } from './format.js';

export interface Transport {
  write(entry: LogEntry): void;
}

export class ConsoleTransport implements Transport {
  public write(entry: LogEntry): void {
    const line = formatConsole(entry);
    switch (entry.level) {
      case 'error':
      case 'warn':
        console.error(line);
        break;
      case 'info':
      case 'debug':
      default:
        console.log(line);
    }
  }
}

export class FileTransport implements Transport {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
  }

  public write(entry: LogEntry): void {
    try {
      appendFileSync(this.filePath, `${formatJson(entry)}\n`);
    } catch {
      // never let log writing crash the app
    }
  }
}

export function dateBasedLogPath(dataDir: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${dataDir}/logs/msq-${today}.log`;
}
