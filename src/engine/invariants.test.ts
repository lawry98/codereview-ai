import { describe, expect, it } from "vitest";
import type { Merged, MergedFinding } from "./agents/schemas";
import { EvidenceLog } from "./evidence";
import { capSeatReport, enforceInvariants } from "./invariants";
import { fixtureSeatReport } from "./test-fixtures";

function finding(overrides: Partial<MergedFinding> = {}): MergedFinding {
  return { ...fixtureSeatReport().findings[0], seats: ["correctness"], ...overrides };
}

function merged(findings: MergedFinding[]): Merged {
  return { verdict: "v", caveats: [], findings, assumptions: [], disagreements: [], doctrineNotes: [], notChecked: [] };
}

function logWith(...ids: string[]): EvidenceLog {
  const log = new EvidenceLog();
  for (const id of ids) log.recordRead(id.split("-")[0], "src/a.ts");
  return log;
}

const exists = (path: string) => path === "src/a.ts" || path === "src/b.ts";

describe("enforceInvariants", () => {
  it("keeps a verified major", () => {
    const { merged: out, notes } = enforceInvariants(merged([finding()]), { evidence: logWith("correctness-1"), fileExists: exists });
    expect(out.findings[0]).toMatchObject({ severity: "major", verified: true, evidenceIds: ["correctness-1"] });
    expect(notes).toEqual([]);
  });

  it("strips invented evidence ids and demotes the now-unverified major", () => {
    const { merged: out, notes } = enforceInvariants(merged([finding({ evidenceIds: ["correctness-9"] })]), { evidence: logWith("correctness-1"), fileExists: exists });
    expect(out.findings[0]).toMatchObject({ severity: "minor", verified: false, demotedFrom: "major", evidenceIds: [] });
    expect(notes.join("\n")).toMatch(/unknown evidence ids/);
    expect(notes.join("\n")).toMatch(/Demoted .* from major to minor/);
  });

  it("drops findings citing a file that does not exist", () => {
    const { merged: out, notes } = enforceInvariants(merged([finding({ path: "src/ghost.ts" })]), { evidence: logWith("correctness-1"), fileExists: exists });
    expect(out.findings).toEqual([]);
    expect(notes[0]).toMatch(/Dropped src\/ghost\.ts:3/);
  });

  it("sorts by severity, keeping order within a severity", () => {
    const input = [finding({ severity: "nit", claim: "n1" }), finding({ severity: "blocker", claim: "b1" }), finding({ severity: "nit", claim: "n2" })];
    const { merged: out } = enforceInvariants(merged(input), { evidence: logWith("correctness-1"), fileExists: exists });
    expect(out.findings.map((f) => f.claim)).toEqual(["b1", "n1", "n2"]);
  });

  it("caps nits at ten", () => {
    const nits = Array.from({ length: 12 }, (_, i) => finding({ severity: "nit", claim: `n${i}` }));
    const { merged: out, notes } = enforceInvariants(merged(nits), { evidence: logWith("correctness-1"), fileExists: exists });
    expect(out.findings).toHaveLength(10);
    expect(notes.join("\n")).toMatch(/Cut 2 nits/);
  });
});

describe("capSeatReport", () => {
  it("keeps six findings and five assumptions, moving extra findings to notPursued", () => {
    const base = fixtureSeatReport();
    const report = {
      ...base,
      findings: Array.from({ length: 8 }, (_, i) => ({ ...base.findings[0], claim: `c${i}` })),
      assumptions: Array.from({ length: 7 }, () => base.assumptions[0]),
    };
    const capped = capSeatReport(report);
    expect(capped.findings).toHaveLength(6);
    expect(capped.assumptions).toHaveLength(5);
    expect(capped.notPursued).toEqual(["c6 (src/a.ts:3)", "c7 (src/a.ts:3)"]);
  });
});
