import { describe, expect, it } from "vitest";
import { composeTeam } from "../compose";
import { seatById } from "../roster";
import { fixtureBrief, fixtureContext, fixtureSeatReport } from "../test-fixtures";
import { fallbackMerge, mergeSeatReports, writeBrief } from "./lead";
import { mockModel, textStep } from "./mock-model";
import type { Merged } from "./schemas";
import type { SeatRun } from "./seat";

const correctness = seatById("correctness");
if (!correctness) throw new Error("roster is missing correctness");

const run: SeatRun = { seat: correctness, why: "standing", report: fixtureSeatReport(), usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 }, steps: 2, durationMs: 5 };

describe("writeBrief", () => {
  it("returns the parsed brief and its usage", async () => {
    const model = mockModel([textStep(JSON.stringify(fixtureBrief()), "0.03")]);
    const result = await writeBrief({ model, ctx: fixtureContext(), doctrine: [], team: composeTeam({ signals: [], changedLines: 120 }) });
    expect(result.brief).toEqual(fixtureBrief());
    expect(result.usage.costUsd).toBeCloseTo(0.03);
  });
});

describe("mergeSeatReports", () => {
  it("returns the parsed merged report", async () => {
    const merged: Merged = {
      verdict: "Not mergeable: refunds round the wrong way.",
      caveats: [],
      findings: [{ ...fixtureSeatReport().findings[0], seats: ["correctness"] }],
      assumptions: [],
      disagreements: [],
      doctrineNotes: [],
      notChecked: [],
    };
    const result = await mergeSeatReports({ model: mockModel([textStep(JSON.stringify(merged))]), ctx: fixtureContext(), brief: fixtureBrief(), runs: [run], caveats: [] });
    expect(result.merged).toEqual(merged);
  });
});

describe("fallbackMerge", () => {
  it("keeps every seat's findings side by side and says the merge failed", () => {
    const merged = fallbackMerge([run], ["UI not rendered."], "timeout");
    expect(merged.findings).toEqual([{ ...fixtureSeatReport().findings[0], seats: ["correctness"] }]);
    expect(merged.assumptions[0].seats).toEqual(["correctness"]);
    expect(merged.caveats).toEqual(["UI not rendered.", "Merge step failed: timeout"]);
    expect(merged.verdict).toMatch(/merge step failed/i);
  });
});
