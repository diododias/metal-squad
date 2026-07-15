import { accessSync, constants, readFileSync } from 'node:fs';
import {
  CONFIG_DIR,
  DATA_DIR,
  DB_PATH_ENV,
  resolveDbPath,
} from '../config/index.js';
import { resolveRepo } from '../core/repo.js';
import { assertWritableDbPath } from '../db/index.js';
import type { EnvironmentInfo } from './types.js';

function isDbWritable(databasePath: string): boolean {
  try {
    assertWritableDbPath(databasePath, { createDataDir: false });
    return true;
  } catch {
    return false;
  }
}

function isDirectoryWritable(directory: string): boolean {
  try {
    accessSync(directory, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function readVersion(): string | undefined {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version?: unknown };
    return typeof packageJson.version === 'string' ? packageJson.version : undefined;
  } catch {
    return undefined;
  }
}

/** Collects backend diagnostics without creating files, directories, or database state. */
export function collectEnvironmentInfo(cwd = process.cwd()): EnvironmentInfo {
  const databasePath = resolveDbPath();
  let repoPath: string | undefined;
  let repoId: string | undefined;

  try {
    ({ path: repoPath, repoId } = resolveRepo(cwd));
  } catch {
    // Diagnostics should remain available outside a git repository.
  }

  return {
    databasePath,
    databaseSource: process.env[DB_PATH_ENV] === undefined ? 'default' : 'override',
    dbWritable: isDbWritable(databasePath),
    dataDir: DATA_DIR,
    configDir: CONFIG_DIR,
    configWritable: isDirectoryWritable(CONFIG_DIR),
    repoPath,
    repoId,
    version: readVersion(),
  };
}
