import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
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
