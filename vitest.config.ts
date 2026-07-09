import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '.claude/**',
      '.stryker-tmp/**',
      '.worktrees/**',
      'dist/**',
      '**/node_modules/**',
    ],
    coverage: {
      exclude: [
        '.claude/**',
        'vitest.config.ts',
        'tests/**',
        'dist/**',
        'src/**/types.ts',
      ],
      thresholds: {
        statements: 90,
        lines: 90,
      },
    },
  },
});
