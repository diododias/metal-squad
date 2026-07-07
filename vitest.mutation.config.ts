import { defineConfig } from 'vitest/config';

// Stryker runs tests in worker threads where process.chdir() is not supported.
// Using pool:'forks' spawns each test in a child process instead, which makes
// chdir-based tests (e.g. commands/init) work correctly under mutation testing.
export default defineConfig({
  test: {
    pool: 'forks',
    exclude: [
      '.claude/**',
      '.stryker-tmp/**',
      'dist/**',
      'node_modules/**',
    ],
  },
});
