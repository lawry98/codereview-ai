import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { EvidenceLog } from "../evidence";
import { seatById } from "../roster";
import { FakeRunner } from "../sandbox/fake";
import { fixtureBrief, fixtureContext, fixtureSeatReport } from "../test-fixtures";
import { mockModel, textStep, toolStep } from "./mock-model";
import { runSeat } from "./seat";
import { makeSeatTools } from "./tools";

const correctness = seatById("correctness");
if (!correctness) throw new Error("roster is missing correctness");

const HEAD = "a".repeat(40);
const PROBE = "node -e 'console.log(Math.round(-2.5))'";

/** Answers the tree check after each command with the reviewed HEAD, so the happy path stays clean. */
function sandbox(): FakeRunner {
  return new FakeRunner({
    handler: (cmd) => {
      if (cmd.startsWith("git status")) return { output: `HEAD ${HEAD}\n` };
      if (cmd === PROBE) return { output: "-2\n" };
      return undefined;
    },
  });
}

describe("runSeat", () => {
  it("runs the tool loop, then returns the structured report with usage", async () => {
    const model = mockModel([toolStep("run_command", { cmd: PROBE }), textStep(JSON.stringify(fixtureSeatReport()))]);
    const runner = sandbox();
    const evidence = new EvidenceLog();
    const run = await runSeat({
      model,
      seat: correctness,
      why: "standing",
      ctx: fixtureContext(),
      brief: fixtureBrief(),
      tools: makeSeatTools({ seat: "correctness", runner, evidence, headSha: HEAD }),
    });

    expect(run.error).toBeUndefined();
    expect(run.steps).toBe(2);
    expect(run.report.findings[0].evidenceIds).toEqual(["correctness-1"]);
    // The report only echoes the mock's JSON; these show the tool really ran in the sandbox and was logged.
    expect(runner.commands()).toContain(PROBE);
    expect(evidence.get("correctness-1")).toMatchObject({ kind: "command", cmd: PROBE, output: "-2\n" });
    expect(run.usage).toEqual({ inputTokens: 200, outputTokens: 40, costUsd: expect.closeTo(0.02) });
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain("Does Math.round treat negative prices the way callers expect?");
  });

  it("lets the model call tools until the last allowed step, then forces the report", async () => {
    const model = mockModel([toolStep("run_command", { cmd: PROBE }), textStep(JSON.stringify(fixtureSeatReport()))]);
    const run = await runSeat({
      model,
      seat: correctness,
      why: "standing",
      ctx: fixtureContext(),
      brief: fixtureBrief(),
      tools: makeSeatTools({ seat: "correctness", runner: sandbox(), evidence: new EvidenceLog(), headSha: HEAD }),
      maxSteps: 2,
    });
    expect(run.error).toBeUndefined();
    expect(run.steps).toBe(2);
    expect(model.doGenerateCalls[0].toolChoice).not.toEqual({ type: "none" });
    expect(model.doGenerateCalls[1].toolChoice).toEqual({ type: "none" });
  });

  it("returns an empty report that says why when the model fails, instead of throwing", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error("rate limited");
      },
    });
    const run = await runSeat({
      model,
      seat: correctness,
      why: "standing",
      ctx: fixtureContext(),
      brief: fixtureBrief(),
      tools: makeSeatTools({ seat: "correctness", runner: new FakeRunner(), evidence: new EvidenceLog(), headSha: HEAD }),
    });
    expect(run.error).toMatch(/rate limited/);
    expect(run.report.findings).toEqual([]);
    expect(run.report.notChecked[0]).toMatch(/This seat failed/);
    expect(run.usage.costUsd).toBeNull();
  });
});
