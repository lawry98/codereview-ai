import type { PrTarget } from "./types";

export function fixtureTarget(overrides: Partial<PrTarget> = {}): PrTarget {
  return {
    owner: "acme",
    repo: "widgets",
    number: 7,
    url: "https://github.com/acme/widgets/pull/7",
    title: "Fix rounding in price formatter",
    body: "Rounds half up instead of truncating.",
    state: "open",
    baseRef: "main",
    baseSha: "basesha",
    headSha: "headsha",
    cloneUrl: "https://github.com/acme/widgets.git",
    files: [{ path: "src/a.ts", status: "modified", additions: 5, deletions: 2 }],
    ...overrides,
  };
}
