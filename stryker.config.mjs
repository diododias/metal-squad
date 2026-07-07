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
    high: 70,
    low: 40,
    break: 30,
  },
  reporters: ['progress', 'html'],
  incremental: true,
  incrementalFile: '.stryker-tmp/incremental.json',
};
