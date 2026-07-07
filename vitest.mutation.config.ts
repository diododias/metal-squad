import { defineConfig } from 'vitest/config';

// Stryker runs the initial dry-run in worker threads (vmThreads) for perTest
// coverage analysis, where process.chdir() is not supported.
// tests/commands/ uses process.chdir() in integration-style tests and is not
// relevant to the mutated code (src/core/ and src/db/), so we exclude it here.
export default defineConfig({
  test: {
    exclude: [
      '.claude/**',
      '.stryker-tmp/**',
      'dist/**',
      'node_modules/**',
      'tests/commands/**',
    ],
  },
});
