import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { mockModel, textStep, toolStep } from "./agents/mock-model";
import type { Merged } from "./agents/schemas";
import type { GitHubClient } from "./github/client";
import { reviewPr, type ProgressEvent } from "./review";
import { FakeRunner } from "./sandbox/fake";
import { fakeFactory, fakeRepoHandler } from "./sandbox/fake-repo";
import { fixtureBrief, fixtureSeatReport, fixtureTarget } from "./test-fixtures";
import type { PrTarget } from "./types";

const URL = "https://github.com/acme/widgets/pull/7";
const ids = { lead: "lead-model", seat: "seat-model" };
const HEX = "a".repeat(40);
const OTHER_HEX = "b".repeat(40);
const PROBE = "node -e 'console.log(Math.round(-2.5))'";
const SEATS = ["correctness", "design", "craft", "spec", "tests"];

function github(target: PrTarget = fixtureTarget({ headSha: HEX })): GitHubClient {
  return { fetchPr: async () => target };
}

const merged: Merged = {
  verdict: "Not mergeable: refunds round the wrong way.",
  caveats: [],
  findings: [{ ...fixtureSeatReport().findings[0], seats: ["correctness"] }],
  assumptions: [],
  disagreements: [],
  doctrineNotes: [],
  notChecked: [],
};

/** Stateless, so every seat can share it: it runs the probe until a tool result is in its prompt, then reports. */
function seatModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt }) =>
      prompt.some((message) => message.role === "tool") ? textStep(JSON.stringify(fixtureSeatReport()), "0.02") : toolStep("run_command", { cmd: PROBE }, "0.01"),
  });
}

/** Answers the tree check after each command with the head the sandbox was provisioned at, so the happy path stays clean. */
const seatRunner = (head = HEX) => () =>
  new FakeRunner({
    handler: (cmd) => {
      if (cmd.startsWith("git status")) return { output: `HEAD ${head}\n` };
      if (cmd.startsWith("node -e")) return { output: "-2\n" };
      return undefined;
    },
  });

const repoAt = (head: string, overrides: Parameters<typeof fakeRepoHandler>[0] = {}) =>
  fakeRepoHandler({ "git rev-parse HEAD": { output: `${head}\n` }, ...overrides });

describe("reviewPr", () => {
  it("reviews a small PR end to end with a verified finding and cleans up", async () => {
    const factory = fakeFactory(repoAt(HEX), seatRunner());
    const events: ProgressEvent[] = [];
    const outcome = await reviewPr(URL, {
      github: github(),
      sandboxes: factory,
      models: { lead: mockModel([textStep(JSON.stringify(fixtureBrief())), textStep(JSON.stringify(merged))]), seat: seatModel(), ids },
      onProgress: (e) => events.push(e),
    });

    expect(outcome.kind).toBe("reviewed");
    if (outcome.kind !== "reviewed") return;
    const { report } = outcome;
    expect(report.team.seated.map((s) => s.seat)).toEqual(SEATS);
    expect(report.merged.findings[0]).toMatchObject({ severity: "major", verified: true, evidenceIds: ["correctness-1"] });
    expect(report.evidence.map((e) => e.id)).toEqual(["correctness-1"]);
    expect(report.execution).toBe("full");
    expect(report.target).toMatchObject({ headSha: HEX, mergeBase: "mergebase", changedLines: 7 });
    expect(report.merged.caveats).toEqual([]);
    // brief 0.01 + merge 0.01 + 5 seats x (probe 0.01 + report 0.02)
    expect(report.stamp.usage.costUsd).toBeCloseTo(0.17);
    expect(report.stamp.models).toEqual(ids);
    expect(factory.seats).toHaveLength(SEATS.length);
    expect(factory.seats.every((s) => s.stopped)).toBe(true);
    expect(factory.deleted).toEqual(["snap_fake"]);
    expect(events.filter((e) => e.type === "stage").map((e) => (e.type === "stage" ? e.stage : ""))).toEqual(["fetch", "provision", "brief", "seats", "merge", "report"]);
    expect(events.filter((e) => e.type === "seat-start")).toHaveLength(SEATS.length);
    expect(events.filter((e) => e.type === "seat-done")).toEqual(SEATS.map((seat) => ({ type: "seat-done", seat, findings: 1 })));
  });

  it("rejects an unsupported PR without creating a sandbox", async () => {
    const factory = fakeFactory();
    const outcome = await reviewPr(URL, {
      github: github(fixtureTarget({ files: [{ path: "main.go", status: "modified", additions: 3, deletions: 0 }] })),
      sandboxes: factory,
      models: { lead: mockModel([]), seat: mockModel([]), ids },
    });
    expect(outcome).toMatchObject({ kind: "rejected", reason: expect.stringMatching(/JS\/TS and Python only/) });
    expect(factory.base).toBeUndefined();
  });

  it("applies limits.maxChangedLines to the gate", async () => {
    const factory = fakeFactory();
    const outcome = await reviewPr(URL, { github: github(), sandboxes: factory, models: { lead: mockModel([]), seat: mockModel([]), ids }, limits: { maxChangedLines: 5 } });
    expect(outcome).toMatchObject({ kind: "rejected", reason: expect.stringMatching(/changes 7 lines; the limit is 5/) });
    expect(factory.base).toBeUndefined();
  });

  it("stops before any model call when the sandbox cannot resolve the PR", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git merge-base": { exitCode: 1 } }));
    const lead = mockModel([]);
    const outcome = await reviewPr(URL, { github: github(), sandboxes: factory, models: { lead, seat: mockModel([]), ids } });
    expect(outcome).toMatchObject({ kind: "unresolved", problems: [expect.stringMatching(/merge base/)] });
    expect(lead.doGenerateCalls).toHaveLength(0);
  });

  it("falls back to an unmerged report when the merge call fails", async () => {
    let leadCalls = 0;
    const lead = new MockLanguageModelV4({
      doGenerate: async () => {
        leadCalls += 1;
        if (leadCalls === 1) return textStep(JSON.stringify(fixtureBrief()));
        throw new Error("merge exploded");
      },
    });
    const factory = fakeFactory(repoAt(HEX), seatRunner());
    const outcome = await reviewPr(URL, { github: github(), sandboxes: factory, models: { lead, seat: seatModel(), ids } });
    expect(outcome.kind).toBe("reviewed");
    if (outcome.kind !== "reviewed") return;
    expect(outcome.report.merged.caveats.join("\n")).toMatch(/Merge step failed: merge exploded/);
    // One finding per seat, side by side and undeduplicated.
    expect(outcome.report.merged.findings.flatMap((f) => f.seats)).toEqual(SEATS);
    expect(outcome.report.stamp.usage.costUsd).toBeNull();
    expect(factory.seats.every((s) => s.stopped)).toBe(true);
    expect(factory.deleted).toEqual(["snap_fake"]);
  });

  it("puts a moved PR head in the verdict caveats and reviews the commit the sandbox checked out", async () => {
    const factory = fakeFactory(repoAt(OTHER_HEX), seatRunner(OTHER_HEX));
    const outcome = await reviewPr(URL, {
      github: github(fixtureTarget({ headSha: HEX })),
      sandboxes: factory,
      models: { lead: mockModel([textStep(JSON.stringify(fixtureBrief())), textStep(JSON.stringify(merged))]), seat: seatModel(), ids },
    });
    expect(outcome.kind).toBe("reviewed");
    if (outcome.kind !== "reviewed") return;
    expect(outcome.report.merged.caveats).toContain(
      `The PR head moved after its metadata was fetched; this review covers ${OTHER_HEX.slice(0, 12)}, not ${HEX.slice(0, 12)}.`,
    );
    expect(outcome.report.target.headSha).toBe(OTHER_HEX);
    // Seats are held to the commit the sandbox checked out. Held to the stale target sha, every command would look like a moved HEAD and trigger a reset.
    expect(factory.seats.every((s) => s.commands().every((cmd) => !cmd.startsWith("git reset")))).toBe(true);
  });

  it("stops every seat sandbox and deletes the snapshot when a seat sandbox cannot be created", async () => {
    const factory = fakeFactory(repoAt(HEX), seatRunner());
    const create = factory.fromSnapshot.bind(factory);
    let created = 0;
    factory.fromSnapshot = async () => {
      created += 1;
      if (created === 2) throw new Error("no capacity");
      return create();
    };
    const outcome = reviewPr(URL, {
      github: github(),
      sandboxes: factory,
      models: { lead: mockModel([textStep(JSON.stringify(fixtureBrief()))]), seat: seatModel(), ids },
      limits: { seatConcurrency: 2 },
    });
    await expect(outcome).rejects.toThrow("no capacity");
    expect(created).toBe(2);
    expect(factory.seats).toHaveLength(1);
    expect(factory.seats.every((s) => s.stopped)).toBe(true);
    expect(factory.deleted).toEqual(["snap_fake"]);
  });
});
