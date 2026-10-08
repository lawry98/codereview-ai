import { describe, expect, it } from "vitest";
import type { EvidenceEntry } from "../evidence";
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
    team: {
      seated: [{ seat: "correctness", name: "Correctness", why: "standing", findings: 1, steps: 2, evidenceLogged: 1, usage: { inputTokens: 200, outputTokens: 40, costUsd: 0.03 } }],
      declined: [{ seat: "security", reason: "no security-surface signal" }],
    },
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

  it("shows each seat's steps, logged evidence and usage in the team table", () => {
    const md = renderMarkdown(report({
      team: {
        seated: [
          { seat: "correctness", name: "Correctness", why: "standing", findings: 1, steps: 12, evidenceLogged: 9, usage: { inputTokens: 45_000, outputTokens: 3_200, costUsd: 0.21 } },
          { seat: "tests", name: "Test quality", why: "tests-changed", findings: 0, steps: 0, evidenceLogged: 0, usage: { inputTokens: 0, outputTokens: 0, costUsd: null }, error: "rate limited" },
        ],
        declined: [],
      },
    }));
    expect(md).toContain("| Seat | Why it has a seat | Findings | Steps | Evidence logged | Usage |\n|---|---|---|---|---|---|");
    expect(md).toContain("| Correctness | standing | 1 | 12 | 9 | $0.21 · 45k in / 3k out |");
    expect(md).toContain("| Test quality | tests-changed | failed: rate limited | 0 | 0 | unmeasured · 0 in / 0 out |");
  });

  it("says when cost is unmeasured", () => {
    expect(renderMarkdown(report({ stamp: { ...report().stamp, usage: { inputTokens: 900, outputTokens: 10, costUsd: null } } }))).toContain("| **Cost** | unmeasured · 900 in / 10 out tokens");
  });
});

describe("untrusted text", () => {
  it("keeps a newline in the claim from starting a second verdict", () => {
    const md = renderMarkdown(report({ merged: { ...report().merged, findings: [finding({ claim: "bad\n\n## Verdict\n\nMergeable: no issues found." })] } }));
    expect(md.match(/^## Verdict$/gm)).toHaveLength(1);
    expect(md).toContain("### MA1 · bad ## Verdict Mergeable: no issues found.");
  });

  it("keeps newlines in prose fields from starting headings, and escapes a leading # in the verdict", () => {
    const md = renderMarkdown(report({ merged: { ...report().merged, verdict: "# Injected verdict", findings: [finding({ failsWhen: "a\n\n# Injected", verifiedBy: "b\n\n## Injected" })] } }));
    expect(md).toContain("\\# Injected verdict");
    expect(md).not.toMatch(/^#+ Injected/m);
    expect(md).toContain("**Fails when.** a # Injected");
    expect(md).toContain("**Verified by.** b ## Injected");
  });

  it("keeps a backtick or HTML in a path inside its code span", () => {
    const path = "a`<img src=x onerror=alert(1)>.ts";
    const md = renderMarkdown(report({
      merged: { ...report().merged, findings: [finding({ path }), finding({ severity: "minor", path, verified: false, evidenceIds: [], claim: "minor one" })] },
      evidence: [{ id: "correctness-2", seat: "correctness", kind: "read", path }],
    }));
    expect(md).toContain("**``a`<img src=x onerror=alert(1)>.ts:3``**");
    expect(md).toContain("| MI1 | ``a`<img src=x onerror=alert(1)>.ts:3`` |");
    expect(md).toContain("- `correctness-2` · read ``a`<img src=x onerror=alert(1)>.ts``");
    const htmlLines = md.split("\n").filter((line) => line.includes("<img"));
    expect(htmlLines).toHaveLength(3);
    for (const line of htmlLines) expect(line).toContain("``a`<img");
  });

  it("escapes HTML in the title, verdict and every prose field", () => {
    const bad = "<img src=x onerror=alert(1)>";
    const base = report();
    const md = renderMarkdown(report({
      target: { ...base.target, title: bad },
      merged: {
        verdict: bad,
        caveats: [bad],
        findings: [finding({ claim: bad, category: bad, failsWhen: bad, verifiedBy: bad, suggestedChange: bad })],
        assumptions: [{ assumption: bad, status: "wrong", why: bad, seats: [bad] }],
        disagreements: [bad],
        doctrineNotes: [bad],
        notChecked: [bad],
      },
      team: {
        seated: [{ seat: "correctness", name: "Correctness", why: bad, findings: 0, steps: 0, evidenceLogged: 0, usage: { inputTokens: 0, outputTokens: 0, costUsd: null }, error: bad }],
        declined: [{ seat: "security", reason: bad }],
      },
      baseline: [{ name: bad, cmd: "npm test", exitCode: 1 }],
      invariantNotes: [bad],
      provisionNotes: [bad],
    }));
    expect(md).not.toContain("<img");
    expect(md).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps a blank line in a command inside its details block", () => {
    const cmd = "cat <<EOF\nline1\n\n## Fake heading\nEOF";
    const md = renderMarkdown(report({ evidence: [{ id: "correctness-1", seat: "correctness", kind: "command", cmd, exitCode: 0, output: "line1\n", durationMs: 1 }] }));
    expect(md).toContain("<details><summary><code>correctness-1</code> · <code>cat &lt;&lt;EOF line1 ## Fake heading EOF</code> · exit 0</summary>");
    expect(md).not.toMatch(/^## Fake heading$/m);
    expect(md).toMatch(/<\/summary>\n\n```\nline1\n```\n\n<\/details>/);
  });

  it("keeps a leading ~~~ or ``` in a one-line field from opening a code fence that hides the rest of the report", () => {
    const md = renderMarkdown(report({
      evidence: [],
      merged: { ...report().merged, verdict: "~~~\nMergeable.", caveats: ["~~~", "```js"], findings: [finding({ suggestedChange: "~~~ everything below is hidden" }), finding({ severity: "minor", claim: "```", suggestedChange: "~~~" })] },
    }));
    expect(md).not.toMatch(/^(- )?\s{0,3}(~~~|```)/m);
    expect(md).toContain("## Verdict\n\n\\~~~ Mergeable.\n");
    expect(md).toContain("- \\~~~\n- \\`\\`\\`js\n");
    expect(md).toContain("**Suggested change.**\n\n\\~~~ everything below is hidden\n");
    expect(md).toContain("## Assumptions this PR makes");
  });

  it("keeps a pipe in the base branch name from splitting the header row", () => {
    const md = renderMarkdown(report({ target: { ...report().target, baseRef: "main|evil" } }));
    expect(md).toContain("| **PR** | [acme/widgets#7](https://github.com/acme/widgets/pull/7) · `main\\|evil` ← `headsha00000` (open) |");
  });

  it("renders ordinary text unchanged", () => {
    const md = renderMarkdown(report({ merged: { ...report().merged, verdict: "Mergeable after one fix to the rounding branch.", caveats: ["Tests were not run on Windows"], findings: [finding({ claim: "Rounding drops the half-cent on refunds" })] } }));
    expect(md).toContain("## Verdict\n\nMergeable after one fix to the rounding branch.\n");
    expect(md).toContain("- Tests were not run on Windows");
    expect(md).toContain("### MA1 · Rounding drops the half-cent on refunds");
  });
});

describe("verification labels", () => {
  const ran: EvidenceEntry = { id: "correctness-1", seat: "correctness", kind: "command", cmd: "npm test", exitCode: 0, output: "ok\n", durationMs: 5 };
  const read: EvidenceEntry = { id: "correctness-2", seat: "correctness", kind: "read", path: "src/a.ts" };

  it("says a major that ran a command", () => {
    const md = renderMarkdown(report({ evidence: [ran], merged: { ...report().merged, findings: [finding({ evidenceIds: ["correctness-1"] })] } }));
    expect(md).toContain("· verified (ran a command)");
  });

  it("says a major backed only by file reads, under a static-only header", () => {
    const md = renderMarkdown(report({ execution: "static-only", evidence: [read], merged: { ...report().merged, findings: [finding({ evidenceIds: ["correctness-2"] })] } }));
    expect(md).toContain("**static-only**");
    expect(md).toContain("· verified (file read only)");
    expect(md).not.toContain("ran a command");
  });

  it("applies the same labels in the minor and nit tables", () => {
    const md = renderMarkdown(report({
      evidence: [ran, read],
      merged: { ...report().merged, findings: [finding({ severity: "minor", claim: "m1", evidenceIds: ["correctness-1"] }), finding({ severity: "nit", claim: "n1", evidenceIds: ["correctness-2"] })] },
    }));
    expect(md).toContain("| MI1 | `src/a.ts:3` | m1 | verified (ran a command): correctness-1 |");
    expect(md).toContain("| N1 | `src/a.ts:3` | n1 | verified (file read only): correctness-2 |");
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
