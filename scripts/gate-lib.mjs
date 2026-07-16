export const MIN_NODE_VERSION = '20.17.0';

const TEST_FILE_PATTERN = /^tests\/.+\.test\.tsx?$/;
const RELEVANT_FILE_PATTERN = /^(src|tests)\/.+\.(ts|tsx|js|mjs)$/;

function parseVersion(version) {
  return version.replace(/^v/, '').split('.').map(Number);
}

export function isNodeVersionSupported(current, minimum = MIN_NODE_VERSION) {
  const currentParts = parseVersion(current);
  const minimumParts = parseVersion(minimum);
  for (let index = 0; index < 3; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }
  return true;
}

export function assertNodeVersion(current = process.versions.node) {
  if (!isNodeVersionSupported(current)) {
    throw new Error(
      `Node ${current} is below the required minimum ${MIN_NODE_VERSION} (see package.json engines).`,
    );
  }
}

/**
 * Maps staged files to the vitest CLI arguments for the fast (pre-commit) gate.
 *
 * - only test files staged: run them directly (`vitest run <files>`)
 * - any src/tests source staged: let vitest resolve the import graph (`vitest related --run <files>`)
 * - nothing relevant staged (docs/skills/rules only): returns null, tests are skipped
 */
export function resolveFastTestArgs(stagedFiles) {
  const relevant = stagedFiles.filter((file) => RELEVANT_FILE_PATTERN.test(file));
  if (relevant.length === 0) return null;
  if (relevant.every((file) => TEST_FILE_PATTERN.test(file))) return ['run', ...relevant];
  return ['related', '--run', ...relevant];
}
