// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { currentHashPath, hashWithRestoredQuery, readHashParams, resetHashStateMemory, updateHashParams } from '../../src/web/client/lib/hashState.js';
import { parseHash } from '../../src/web/client/lib/routes.js';

beforeEach(() => {
  resetHashStateMemory();
  window.location.hash = '';
});

describe('hashState (PF-18)', () => {
  it('reads params from the hash query and defaults the path to /board', () => {
    window.location.hash = '#/projects/p1?status=done&q=auth';
    const params = readHashParams();
    expect(currentHashPath()).toBe('/projects/p1');
    expect(params.get('status')).toBe('done');
    expect(params.get('q')).toBe('auth');
    window.location.hash = '';
    expect(currentHashPath()).toBe('/board');
  });

  it('merges patches into the current query, deleting null and empty values', () => {
    window.location.hash = '#/projects/p1?status=done';
    updateHashParams({ q: 'auth', order: 'progress' });
    expect(window.location.hash).toContain('status=done');
    expect(window.location.hash).toContain('q=auth');
    updateHashParams({ status: null, q: '' });
    expect(window.location.hash).not.toContain('status=');
    expect(window.location.hash).not.toContain('q=');
    expect(window.location.hash).toContain('order=progress');
    updateHashParams({ order: null });
    expect(window.location.hash).toBe('#/projects/p1');
  });

  it('restores the last query written for a path', () => {
    window.location.hash = '#/projects/p1';
    updateHashParams({ status: 'done', q: 'auth' });
    expect(hashWithRestoredQuery('/projects/p1')).toBe('/projects/p1?status=done&q=auth');
    expect(hashWithRestoredQuery('/projects/other')).toBe('/projects/other');
    updateHashParams({ status: null, q: null });
    expect(hashWithRestoredQuery('/projects/p1')).toBe('/projects/p1');
  });

  it('remembers a deep-linked query read on mount for later restoration', () => {
    window.location.hash = '#/projects/p1?status=todo';
    readHashParams();
    window.location.hash = '#/projects/p1/epics/e1';
    expect(hashWithRestoredQuery('/projects/p1')).toBe('/projects/p1?status=todo');
  });

  it('never changes route identity: parseHash ignores the query suffix', () => {
    window.location.hash = '#/projects/p1';
    updateHashParams({ status: 'done', tab: 'templates' });
    expect(parseHash(window.location.hash)).toEqual({ page: 'project-detail', projectId: 'p1' });
  });
});
