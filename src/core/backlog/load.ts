import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { BacklogSchema, type Backlog } from './schema.js';

export const BACKLOG_FILE = 'backlog.yaml';

export function loadBacklog(path = BACKLOG_FILE): Backlog {
  const raw = readFileSync(path, 'utf8');
  return BacklogSchema.parse(parse(raw));
}
