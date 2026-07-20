import { execFileSync } from 'node:child_process';
import { logCaughtError } from '../../events/logging.js';
import type { ForgeAdapter, ForgePullRequestView, ForgeResult } from './types.js';

type CmdResult =
  | { ok: true; stdout: string }
  | { ok: false; stderr: string; code: number | null };

interface CommandError {
  message?: string;
  stderr?: string | Buffer;
  status?: number | null;
}

function runCommand(command: string, args: string[], cwd: string): CmdResult {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    const commandError = error as CommandError;
    const stderr = commandError.stderr?.toString().trim() ?? commandError.message ?? 'command failed';
    return {
      ok: false,
      stderr,
      code: typeof commandError.status === 'number' ? commandError.status : null,
    };
  }
}

function noPullRequest(stderr: string): boolean {
  return /no pull requests? found/i.test(stderr);
}

export class GithubForge implements ForgeAdapter {
  public available(): boolean {
    try {
      execFileSync('gh', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  public viewPullRequest(cwd: string): ForgeResult<ForgePullRequestView | null> {
    return this.readPullRequest(cwd, []);
  }

  public viewPullRequestByNumber(cwd: string, prNumber: number): ForgeResult<ForgePullRequestView | null> {
    return this.readPullRequest(cwd, [String(prNumber)]);
  }

  private readPullRequest(cwd: string, selector: string[]): ForgeResult<ForgePullRequestView | null> {
    const result = runCommand(
      'gh',
      ['pr', 'view', ...selector, '--json', 'number,url,state,baseRefName,headRefName'],
      cwd,
    );
    if (!result.ok) {
      if (noPullRequest(result.stderr)) return { ok: true, value: null };
      return result;
    }

    if (!result.stdout) return { ok: true, value: null };
    try {
      return { ok: true, value: JSON.parse(result.stdout) as ForgePullRequestView };
    } catch (error) {
      logCaughtError('git/forge.github.parsePullRequest', error);
      return {
        ok: false,
        stderr: error instanceof Error ? error.message : 'GitHub CLI returned invalid pull request JSON.',
        code: null,
      };
    }
  }
}
