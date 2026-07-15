import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('FeatureTopicAssociation persistence', () => {
  let directory = '';
  let resetDb: () => void;
  let getDb: (mode?: 'readonly' | 'readwrite') => unknown;
  let getFeatureTopicAssociation: typeof import('../../src/db/repo.js')['getFeatureTopicAssociation'];
  let listFeatureTopicAssociations: typeof import('../../src/db/repo.js')['listFeatureTopicAssociations'];
  let reserveFeatureTopicAssociation: typeof import('../../src/db/repo.js')['reserveFeatureTopicAssociation'];
  let activateFeatureTopicAssociation: typeof import('../../src/db/repo.js')['activateFeatureTopicAssociation'];
  let invalidateFeatureTopicAssociation: typeof import('../../src/db/repo.js')['invalidateFeatureTopicAssociation'];
  let recordFeatureTopicAssociationError: typeof import('../../src/db/repo.js')['recordFeatureTopicAssociationError'];

  beforeEach(async () => {
    vi.resetModules();
    directory = mkdtempSync(join(tmpdir(), 'msq-f54-topics-'));
    process.env.MSQ_DB_PATH = join(directory, 'app.db');
    ({ resetDb, getDb } = await import('../../src/db/index.js'));
    ({
      getFeatureTopicAssociation,
      listFeatureTopicAssociations,
      reserveFeatureTopicAssociation,
      activateFeatureTopicAssociation,
      invalidateFeatureTopicAssociation,
      recordFeatureTopicAssociationError,
    } = await import('../../src/db/repo.js'));
    getDb();
  });

  afterEach(() => {
    resetDb();
    delete process.env.MSQ_DB_PATH;
    rmSync(directory, { recursive: true, force: true });
  });

  it('migrates the association table and enforces one row per chat and feature', () => {
    const expiresAt = new Date(Date.now() + 30_000).toISOString();
    const first = reserveFeatureTopicAssociation('chat-1', 'F54', 'F54 — Topics', {
      leaseToken: 'lease-1',
      leaseExpiresAt: expiresAt,
    });
    expect(first?.state).toBe('creating');

    const second = reserveFeatureTopicAssociation('chat-1', 'F54', 'renamed', {
      leaseToken: 'lease-2',
      leaseExpiresAt: expiresAt,
    });
    expect(second?.leaseToken).toBe('lease-1');
    expect(listFeatureTopicAssociations('chat-1')).toHaveLength(1);
  });

  it('activates, invalidates, and records actionable errors on the same row', () => {
    reserveFeatureTopicAssociation('chat-1', 'F54', 'F54 — Topics', {
      leaseToken: 'lease-1',
      leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    });
    activateFeatureTopicAssociation('chat-1', 'F54', 123);
    expect(getFeatureTopicAssociation('chat-1', 'F54')).toMatchObject({ state: 'active', threadId: 123 });

    invalidateFeatureTopicAssociation('chat-1', 'F54', 'thread deleted');
    expect(getFeatureTopicAssociation('chat-1', 'F54')).toMatchObject({ state: 'invalid', threadId: null, lastError: 'thread deleted' });

    recordFeatureTopicAssociationError('chat-1', 'F54', 'create failed');
    expect(getFeatureTopicAssociation('chat-1', 'F54')).toMatchObject({ state: 'error', lastError: 'create failed' });
  });

  it('recovers an expired creation lease without creating a second row', () => {
    reserveFeatureTopicAssociation('chat-1', 'F54', 'F54 — Topics', {
      leaseToken: 'expired',
      leaseExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const recovered = reserveFeatureTopicAssociation('chat-1', 'F54', 'ignored after creation', {
      leaseToken: 'recovered',
      leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
    });

    expect(recovered?.leaseToken).toBe('recovered');
    expect(recovered?.title).toBe('F54 — Topics');
    expect(listFeatureTopicAssociations()).toHaveLength(1);
  });
});
