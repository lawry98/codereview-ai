import { describe, expect, it } from "vitest";
import { changedLineCount, gatePr } from "./gate";
import type { ChangedFile } from "./types";

const file = (path: string, additions = 5, deletions = 0): ChangedFile => ({ path, status: "modified", additions, deletions });
const opts = { maxChangedLines: 800 };

describe("gatePr", () => {
  it("rejects an empty PR", () => {
    expect(gatePr([], opts)).toEqual({ ok: false, reason: "This pull request has no changed files." });
  });
  it("rejects a PR over the line limit and says why", () => {
    const result = gatePr([file("src/a.ts", 500, 301)], opts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/changes 801 lines; the limit is 800/);
  });
  it("rejects other languages, naming the extensions", () => {
    const result = gatePr([file("src/a.ts"), file("cmd/main.go"), file("lib/x.rs")], opts);
    expect(result).toEqual({ ok: false, reason: "proofread executes JS/TS and Python only; this pull request changes .go, .rs files." });
  });
  it("rejects shell and PowerShell code, naming the extension", () => {
    expect(gatePr([file("src/a.ts"), file("scripts/deploy.sh")], opts)).toEqual({ ok: false, reason: "proofread executes JS/TS and Python only; this pull request changes .sh files." });
    expect(gatePr([file("src/a.ts"), file("x.ps1")], opts)).toEqual({ ok: false, reason: "proofread executes JS/TS and Python only; this pull request changes .ps1 files." });
  });
  it("accepts TypeScript", () => {
    expect(gatePr([file("src/a.tsx")], opts)).toEqual({ ok: true, ecosystems: ["node"], changedLines: 5 });
  });
  it("accepts mixed JS and Python", () => {
    expect(gatePr([file("web/app.ts"), file("api/main.py")], opts)).toEqual({ ok: true, ecosystems: ["node", "python"], changedLines: 10 });
  });
  it("treats a manifest-only change as its ecosystem", () => {
    expect(gatePr([file("package.json")], opts)).toEqual({ ok: true, ecosystems: ["node"], changedLines: 5 });
  });
  it("rejects a docs-only change", () => {
    expect(gatePr([file("README.md")], opts)).toEqual({ ok: false, reason: "This pull request changes no JS/TS or Python code, so there is nothing to execute." });
  });
});

describe("changedLineCount", () => {
  it("sums additions and deletions", () => expect(changedLineCount([file("a", 3, 2), file("b", 1, 0)])).toBe(6));
});
