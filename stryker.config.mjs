/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.mutation.config.ts',
  },
  mutate: [
    'src/core/**/*.ts',
    'src/db/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.types.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  reporters: ['progress', 'html'],
  incremental: true,
  incrementalFile: '.stryker-tmp/incremental.json',
};
