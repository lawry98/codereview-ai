import type { ReviewContext } from "./agents/prompts";
import type { Brief, SeatReport } from "./agents/schemas";
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

export function fixtureContext(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    target: fixtureTarget(),
    headSha: "headsha",
    mergeBase: "mergebase",
    diff: "diff --git a/src/a.ts b/src/a.ts\n-  return Math.floor(x)\n+  return Math.round(x)\n",
    baseline: [
      {
        check: { name: "test", ecosystem: "node", cmd: "npm run --silent test" },
        result: { cmd: "npm run --silent test", exitCode: 0, output: "ok", truncated: false, durationMs: 10 },
      },
    ],
    execution: "full",
    provisionNotes: [],
    ...overrides,
  };
}

export function fixtureBrief(overrides: Partial<Brief> = {}): Brief {
  return {
    intent: "Switch price formatting from truncation to rounding.",
    doctrine: "Prices are integer cents. Never use floats for money.",
    doesNotBind: "No other docs.",
    startHere: [{ seat: "correctness", questions: ["Does Math.round treat negative prices the way callers expect?"] }],
    declineSeats: [],
    ...overrides,
  };
}

export function fixtureSeatReport(overrides: Partial<SeatReport> = {}): SeatReport {
  return {
    findings: [
      {
        severity: "major",
        path: "src/a.ts",
        line: 3,
        category: "rounding",
        claim: "Math.round rounds -2.5 to -2, not -3.",
        failsWhen: "price = -2.5 (a refund) → -2",
        verifiedBy: "ran node -e 'console.log(Math.round(-2.5))' → -2",
        evidenceIds: ["correctness-1"],
        suggestedChange: "Round half away from zero: Math.sign(x) * Math.round(Math.abs(x)).",
      },
    ],
    notPursued: [],
    assumptions: [{ assumption: "Prices are never negative", status: "wrong", why: "Refunds produce negative prices" }],
    notChecked: [],
    ...overrides,
  };
}
