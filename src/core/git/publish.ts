import { execFileSync } from 'node:child_process';
import type { PublishEvidence } from '../adapters/types.js';

export interface PublishVerification {
  ok: boolean;
  status: 'done' | 'blocked' | 'failed';
  summary: string;
  evidence: PublishEvidence;
}

interface GhPullRequestView {
  number?: number;
  url?: string;
  state?: string;
  baseRefName?: string;
  headRefName?: string;
}

function runCommand(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function tryRunGit(args: string[], cwd: string): string | null {
  try {
    return runCommand('git', args, cwd);
  } catch {
    return null;
  }
}

function tryRunCommand(command: string, args: string[], cwd: string): string | null {
  try {
    return runCommand(command, args, cwd);
  } catch {
    return null;
  }
}

function ghAvailable(): boolean {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function parsePrView(raw: string | null): GhPullRequestView | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GhPullRequestView;
  } catch {
    return null;
  }
}

function countCommitsAheadOfBase(cwd: string, baseBranch: string): number | null {
  const localBase = tryRunGit(['rev-parse', '--verify', baseBranch], cwd);
  if (!localBase) return null;
  const raw = tryRunGit(['rev-list', '--count', `${baseBranch}..HEAD`], cwd);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function resolveRemoteBranch(cwd: string): string | null {
  const upstream = tryRunGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], cwd);
  if (upstream) return upstream;

  const branch = tryRunGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (!branch) return null;
  const remote = tryRunGit(['config', `branch.${branch}.remote`], cwd);
  const mergeRef = tryRunGit(['config', `branch.${branch}.merge`], cwd);
  if (!remote || !mergeRef) return null;
  const remoteRef = mergeRef.replace('refs/heads/', '');
  return `${remote}/${remoteRef}`;
}

function resolvePullRequest(cwd: string): GhPullRequestView | null {
  if (!ghAvailable()) return null;
  const raw = tryRunCommand(
    'gh',
    ['pr', 'view', '--json', 'number,url,state,baseRefName,headRefName'],
    cwd,
  );
  return parsePrView(raw);
}

export function verifyPublishContract(
  cwd: string,
  allowedBaseBranches: string[] = ['develop'],
): PublishVerification {
  // The set of acceptable PR base branches: always `develop`, plus any
  // dependency branch a dependent feature may stack its PR on top of.
  const allowedBases = allowedBaseBranches.length > 0 ? allowedBaseBranches : ['develop'];
  const primaryBase = allowedBases[0] ?? 'develop';
  const allowedLabel = allowedBases.join(' or ');
  const branch = tryRunGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const commitSha = tryRunGit(['rev-parse', 'HEAD'], cwd);
  const remoteBranch = resolveRemoteBranch(cwd);
  const pr = resolvePullRequest(cwd);
  // The effective base is the PR's actual base when it is one of the allowed
  // branches (agent may have chosen any dependency branch); otherwise fall back
  // to the primary base for reporting/comparison.
  const effectiveBase = typeof pr?.baseRefName === 'string' && allowedBases.includes(pr.baseRefName)
    ? pr.baseRefName
    : primaryBase;
  const evidence: PublishEvidence = {
    branch,
    baseBranch: effectiveBase,
    commitSha,
    remoteBranch,
    prNumber: typeof pr?.number === 'number' ? pr.number : null,
    prUrl: typeof pr?.url === 'string' ? pr.url : null,
  };

  if (!branch || branch === 'HEAD') {
    return {
      ok: false,
      status: 'failed',
      summary: 'implement: repository is not on a named working branch.',
      evidence,
    };
  }

  if (allowedBases.includes(branch)) {
    return {
      ok: false,
      status: 'failed',
      summary: `implement: branch must not be ${branch}.`,
      evidence,
    };
  }

  const commitsAhead = countCommitsAheadOfBase(cwd, effectiveBase);
  if (commitsAhead === null) {
    return {
      ok: false,
      status: 'blocked',
      summary: `implement: could not compare HEAD against ${effectiveBase}.`,
      evidence,
    };
  }

  if (commitsAhead < 1) {
    return {
      ok: false,
      status: 'failed',
      summary: `implement: branch has no commits ahead of ${effectiveBase}.`,
      evidence,
    };
  }

  if (!remoteBranch) {
    return {
      ok: false,
      status: 'blocked',
      summary: 'implement: branch has no upstream remote configured; push evidence is missing.',
      evidence,
    };
  }

  if (!ghAvailable()) {
    return {
      ok: false,
      status: 'blocked',
      summary: 'implement: GitHub CLI is unavailable, so PR verification could not be completed.',
      evidence,
    };
  }

  if (!pr?.number || !pr.url) {
    return {
      ok: false,
      status: 'blocked',
      summary: `implement: no pull request is open for the current branch against ${allowedLabel}.`,
      evidence,
    };
  }

  if (!pr.baseRefName || !allowedBases.includes(pr.baseRefName)) {
    return {
      ok: false,
      status: 'failed',
      summary: `implement: pull request base is ${pr.baseRefName ?? 'unknown'}, expected ${allowedLabel}.`,
      evidence,
    };
  }

  if (pr.state !== 'OPEN') {
    return {
      ok: false,
      status: 'failed',
      summary: `implement: pull request is not open (state=${pr.state ?? 'unknown'}).`,
      evidence,
    };
  }

  return {
    ok: true,
    status: 'done',
    summary: `implement publish verified on ${branch} (${pr.url}).`,
    evidence,
  };
}
