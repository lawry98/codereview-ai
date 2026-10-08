import { Octokit } from "@octokit/rest";
import type { ChangedFile, FileStatus, PrRef, PrTarget } from "../types";

export interface GitHubClient {
  fetchPr(ref: PrRef): Promise<PrTarget>;
}

type PullData = {
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  merged_at: string | null;
  base: { ref: string; sha: string; repo: { clone_url: string } };
  head: { sha: string };
};

type FileData = { filename: string; status: string; additions: number; deletions: number };

const STATUSES: readonly FileStatus[] = ["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"];

export function toPrTarget(ref: PrRef, pull: PullData, files: FileData[]): PrTarget {
  return {
    ...ref,
    url: pull.html_url,
    title: pull.title,
    body: pull.body ?? "",
    state: pull.merged_at ? "merged" : pull.state === "closed" ? "closed" : "open",
    baseRef: pull.base.ref,
    baseSha: pull.base.sha,
    headSha: pull.head.sha,
    cloneUrl: pull.base.repo.clone_url,
    files: files.map(
      (f): ChangedFile => ({
        path: f.filename,
        status: STATUSES.find((s) => s === f.status) ?? "changed",
        additions: f.additions,
        deletions: f.deletions,
      }),
    ),
  };
}

/** The token stays on the host; it never reaches a sandbox. Without one, GitHub allows 60 requests/hour. */
export function createGitHubClient(token?: string): GitHubClient {
  const octokit = new Octokit(token ? { auth: token } : {});
  return {
    async fetchPr(ref) {
      const params = { owner: ref.owner, repo: ref.repo, pull_number: ref.number };
      const { data: pull } = await octokit.rest.pulls.get(params);
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, { ...params, per_page: 100 });
      return toPrTarget(ref, pull, files);
    },
  };
}
