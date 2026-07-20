import { DomainError } from '../db/errors.js';

export function printDomainOutput(value: unknown, format: string | undefined): void {
  if (format === 'json') {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.table(Array.isArray(value) ? value : [value]);
}

export function rethrowDomainError(error: unknown, format: string | undefined): never {
  if (format === 'json' && error instanceof DomainError) {
    console.error(JSON.stringify({ error: { code: error.code, message: error.message } }));
  }
  throw error;
}

export function parseRevision(value: string | undefined): number {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('--expected-revision must be a positive integer.');
  }
  return revision;
}
