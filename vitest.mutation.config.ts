import { defineConfig } from 'vitest/config';

// Stryker runs the initial dry-run in vmThreads where process.chdir() and
// shared process.env mutations cause interference between parallel workers.
// Only include the test suites that actually cover src/core/ and src/db/,
// which are the only directories mutated by Stryker.
export default defineConfig({
  test: {
    // Only include test files that are vmThreads-safe (no process.env.HOME
    // mutations, no process.chdir, no mkdtempSync). Files with those patterns
    // run fine in the normal npm test but conflict in Stryker's dry-run mode.
    include: [
      'tests/adapters/**/*.test.ts',
      'tests/backlog/schema.test.ts',
      'tests/budget/**/*.test.ts',
      'tests/core/**/*.test.ts',
      'tests/db/repo.test.ts',
      'tests/orchestrator/**/*.test.ts',
      'tests/runner/**/*.test.ts',
    ],
    exclude: [
      '.claude/**',
      '.stryker-tmp/**',
      'dist/**',
      'node_modules/**',
    ],
  },
});
