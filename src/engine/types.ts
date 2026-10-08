export type PrRef = { owner: string; repo: string; number: number };

export type FileStatus = "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";

export type ChangedFile = { path: string; status: FileStatus; additions: number; deletions: number };

export type PrState = "open" | "closed" | "merged";

export type PrTarget = PrRef & {
  url: string;
  title: string;
  body: string;
  state: PrState;
  baseRef: string;
  baseSha: string;
  headSha: string;
  /** HTTPS clone URL of the base repository; fork PRs are fetched via refs/pull/<n>/head. */
  cloneUrl: string;
  files: ChangedFile[];
};

export type Ecosystem = "node" | "python";

export type CommandResult = {
  cmd: string;
  exitCode: number;
  /** Combined stdout+stderr, tail-capped. */
  output: string;
  truncated: boolean;
  durationMs: number;
};
