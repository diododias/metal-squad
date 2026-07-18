export interface ForgePullRequestView {
  number?: number;
  url?: string;
  state?: string;
  baseRefName?: string;
  headRefName?: string;
}

export type ForgeResult<T> =
  | { ok: true; value: T }
  | { ok: false; stderr: string; code: number | null };

export interface ForgeAdapter {
  available(): boolean;
  viewPullRequest(cwd: string): ForgeResult<ForgePullRequestView | null>;
}
