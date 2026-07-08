import { defineConfig } from 'vitest/config';

// pool: 'forks' gives each worker its own process, making process.env and
// process.chdir mutations safe in Stryker's dry-run and mutation phases.
// Slower than vmThreads but correct for tests that mutate shared process state.
export default defineConfig({
  test: {
    pool: 'forks',
    include: [
      'tests/adapters/**/*.test.ts',
      'tests/backlog/**/*.test.ts',
      'tests/budget/**/*.test.ts',
      'tests/core/**/*.test.ts',
      'tests/db/**/*.test.ts',
      'tests/orchestrator/**/*.test.ts',
      'tests/runner/**/*.test.ts',
      'tests/skills/**/*.test.ts',
    ],
    exclude: [
      '.claude/**',
      '.stryker-tmp/**',
      'dist/**',
      'node_modules/**',
      // Integration tests: use real SQLite or process.env.HOME — interfere with Stryker reruns
      'tests/db/repo-cleanup.test.ts',
      'tests/skills/registry.test.ts',
    ],
  },
});
