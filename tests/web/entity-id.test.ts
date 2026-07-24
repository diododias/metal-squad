import { describe, expect, it } from 'vitest';
import { shortId } from '../../src/web/client/lib/entityId.js';

describe('shortId', () => {
  it('uses a deterministic family prefix for every entity kind', () => {
    expect(shortId('project', 'project-1')).toMatch(/^P-[0-9A-F]{8}$/);
    expect(shortId('epic', 'epic-1')).toMatch(/^E-[0-9A-F]{8}$/);
    expect(shortId('repository', 'repo-1')).toMatch(/^R-[0-9A-F]{8}$/);
    expect(shortId('work_item', 'item-1', 'feature')).toMatch(/^F-[0-9A-F]{8}$/);
    expect(shortId('work_item', 'item-1', 'bug')).toMatch(/^B-[0-9A-F]{8}$/);
  });

  it('produces the same short id for the same input', () => {
    expect(shortId('work_item', 'feat-52')).toBe(shortId('work_item', 'feat-52'));
  });
});
