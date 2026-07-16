#!/usr/bin/env node

import { applyFixtureScenario, FIXTURE_SCENARIOS } from '../dist/db/fixtures.js';
import { resetDb } from '../dist/db/index.js';

function parseArgs(argv) {
  const options = { scenario: undefined, repoId: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--scenario') options.scenario = argv[++index];
    else if (arg === '--repo-id') options.repoId = argv[++index];
    else {
      console.error(`Unknown argument: ${arg}`);
      return undefined;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options?.scenario) {
    console.error('Usage: node scripts/db-fixture.mjs --scenario <name> [--repo-id <id>]');
    console.error(`Available scenarios: ${FIXTURE_SCENARIOS.join(', ')}`);
    process.exit(2);
  }

  try {
    const result = applyFixtureScenario(options.scenario, { repoId: options.repoId });
    console.log(
      `Fixture "${result.scenario}" applied at ${result.dbPath} `
        + `(repo ${result.repoId}: ${String(result.epics)} epics, ${String(result.features)} features)`,
    );
  } finally {
    resetDb();
  }
}

main();
