import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config.ts';

export default mergeConfig(baseConfig, defineConfig({
  test: {
    coverage: {
      include: [
        'src/config/**/*.ts',
        'src/core/**/*.ts',
        'src/db/**/*.ts',
        'src/security/**/*.ts',
        'src/commands/backlog.ts',
        'src/commands/init.ts',
        'src/commands/resume.ts',
        'src/commands/run.ts',
        'src/commands/skills.ts',
        'src/commands/status.ts',
      ],
      exclude: [
        'src/**/types.ts',
        'src/core/notify/index.ts',
      ],
      thresholds: {
        statements: 90,
        lines: 90,
      },
    },
  },
}));
