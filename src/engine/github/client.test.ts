import { describe, expect, it } from "vitest";
import { toPrTarget } from "./client";

const ref = { owner: "acme", repo: "widgets", number: 7 };

function pull(overrides: Partial<Parameters<typeof toPrTarget>[1]> = {}): Parameters<typeof toPrTarget>[1] {
  return {
    html_url: "https://github.com/acme/widgets/pull/7",
    title: "Fix rounding",
    body: "Rounds half up.",
    state: "open",
    merged_at: null,
    base: { ref: "main", sha: "basesha", repo: { clone_url: "https://github.com/acme/widgets.git" } },
    head: { sha: "headsha" },
    ...overrides,
  };
}

describe("toPrTarget", () => {
  it("maps an open PR", () => {
    const target = toPrTarget(ref, pull(), [{ filename: "src/a.ts", status: "modified", additions: 3, deletions: 1 }]);
    expect(target).toEqual({
      ...ref,
      url: "https://github.com/acme/widgets/pull/7",
      title: "Fix rounding",
      body: "Rounds half up.",
      state: "open",
      baseRef: "main",
      baseSha: "basesha",
      headSha: "headsha",
      cloneUrl: "https://github.com/acme/widgets.git",
      files: [{ path: "src/a.ts", status: "modified", additions: 3, deletions: 1 }],
    });
  });
  it("reports merged before closed", () => {
    expect(toPrTarget(ref, pull({ state: "closed", merged_at: "2026-10-01T00:00:00Z" }), []).state).toBe("merged");
    expect(toPrTarget(ref, pull({ state: "closed" }), []).state).toBe("closed");
  });
  it("turns a null body into an empty string and unknown statuses into 'changed'", () => {
    const target = toPrTarget(ref, pull({ body: null }), [{ filename: "x", status: "weird", additions: 0, deletions: 0 }]);
    expect(target.body).toBe("");
    expect(target.files[0].status).toBe("changed");
  });
});
