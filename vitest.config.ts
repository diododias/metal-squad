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
        'scripts/**',
        'esbuild.web.mjs',
        'eslint.config.js',
        'stryker.config.mjs',
        'vitest.config.ts',
        'vitest.mutation.config.ts',
        'vitest.config.ts',
        'tests/**',
        'dist/**',
        'src/**/types.ts',
        'src/ui/**',
        'src/web/client/**',
      ],
      thresholds: {
        statements: 90,
        lines: 90,
      },
    },
  },
});
