import { describe, expect, it } from "vitest";
import type { ReportFinding } from "../invariants";
import { fixtureSeatReport } from "../test-fixtures";
import { fence, formatCost, formatDuration, renderMarkdown } from "./markdown";
import type { ReviewReport } from "./types";

function finding(overrides: Partial<ReportFinding> = {}): ReportFinding {
  return { ...fixtureSeatReport().findings[0], seats: ["correctness"], verified: true, ...overrides };
}

function report(overrides: Partial<ReviewReport> = {}): ReviewReport {
  return {
    version: 1,
    engineVersion: "0.2.0-m1",
    target: { owner: "acme", repo: "widgets", number: 7, url: "https://github.com/acme/widgets/pull/7", title: "Fix rounding", state: "open", baseRef: "main", headSha: "headsha000000ff", mergeBase: "mergebase0000ff", changedLines: 7, fileCount: 1 },
    execution: "full",
    baseline: [{ name: "test", cmd: "npm run --silent test", exitCode: 0 }],
    team: { seated: [{ seat: "correctness", name: "Correctness", why: "standing", findings: 1 }], declined: [{ seat: "security", reason: "no security-surface signal" }] },
    merged: { verdict: "Not mergeable: refunds round the wrong way.", caveats: [], findings: [finding()], assumptions: [], disagreements: [], doctrineNotes: [], notChecked: [] },
    evidence: [{ id: "correctness-1", seat: "correctness", kind: "command", cmd: "node -e 'console.log(Math.round(-2.5))'", exitCode: 0, output: "-2\n", durationMs: 40 }],
    invariantNotes: [],
    provisionNotes: [],
    stamp: { startedAt: "2026-10-08T12:00:00.000Z", durationMs: 372_000, models: { lead: "anthropic/claude-opus-5.5", seat: "anthropic/claude-sonnet-5.5" }, usage: { inputTokens: 123_456, outputTokens: 8_100, costUsd: 0.4213 } },
    ...overrides,
  };
}

describe("renderMarkdown", () => {
  it("puts the header and verdict first", () => {
    const md = renderMarkdown(report());
    expect(md.startsWith("# proofread: acme/widgets#7 — Fix rounding\n")).toBe(true);
    expect(md).toContain("| **Cost** | $0.42 · 123k in / 8k out tokens · 6m 12s |");
    expect(md.indexOf("## Verdict")).toBeLessThan(md.indexOf("## Major"));
  });

  it("renders a major finding with its evidence ids and omits empty sections", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("### MA1 · Math.round rounds -2.5 to -2, not -3.");
    expect(md).toContain("**`src/a.ts:3`** · correctness · rounding · verified");
    expect(md).toContain("(evidence: `correctness-1`)");
    expect(md).not.toContain("## Blockers");
    expect(md).not.toContain("## Nits");
  });

  it("labels static-only execution and lists caveats under the verdict", () => {
    const md = renderMarkdown(report({ execution: "static-only", merged: { ...report().merged, caveats: ["Nothing was executed."] } }));
    expect(md).toContain("**static-only**");
    expect(md).toMatch(/## Verdict\n\nNot mergeable[^\n]*\n\n\*\*Caveats\*\*\n\n- Nothing was executed\./);
  });

  it("shows demoted findings in the minor table with escaped pipes", () => {
    const md = renderMarkdown(report({ merged: { ...report().merged, findings: [finding({ severity: "minor", verified: false, demotedFrom: "major", evidenceIds: [], claim: "a | b" })] } }));
    expect(md).toContain("| MI1 | `src/a.ts:3` | a \\| b | unverified (demoted from major) |");
  });

  it("prints cited evidence in collapsible blocks", () => {
    const md = renderMarkdown(report());
    expect(md).toContain("<details><summary><code>correctness-1</code> · <code>node -e &#39;console.log(Math.round(-2.5))&#39;</code> · exit 0</summary>");
  });

  it("says when cost is unmeasured", () => {
    expect(renderMarkdown(report({ stamp: { ...report().stamp, usage: { inputTokens: 900, outputTokens: 10, costUsd: null } } }))).toContain("| **Cost** | unmeasured · 900 in / 10 out tokens");
  });
});

describe("helpers", () => {
  it("fences text containing backticks with a longer fence", () => {
    expect(fence("a ``` b")).toBe("````\na ``` b\n````");
  });
  it("formats durations and costs", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(372_000)).toBe("6m 12s");
    expect(formatCost(0.4213)).toBe("$0.42");
    expect(formatCost(null)).toBe("unmeasured");
  });
});
