import { defineConfig } from 'vitest/config';

// Stryker runs the initial dry-run in vmThreads where process.chdir() and
// shared process.env mutations cause interference between parallel workers.
// Only include the test suites that actually cover src/core/ and src/db/,
// which are the only directories mutated by Stryker.
export default defineConfig({
  test: {
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
    ],
  },
});
