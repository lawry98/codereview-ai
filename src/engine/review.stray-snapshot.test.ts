import { describe, expect, it, vi } from "vitest";
import { mockModel } from "./agents/mock-model";
import type { GitHubClient } from "./github/client";
import { reviewPr } from "./review";
import { fakeFactory } from "./sandbox/fake-repo";
import { fixtureTarget } from "./test-fixtures";

// `provision` never snapshots a PR it could not resolve, so the only way to reach reviewPr's stray-snapshot branch is a stub.
vi.mock("./sandbox/provision", () => ({
  provision: async () => ({
    snapshotId: "snap_stray",
    headSha: "a".repeat(40),
    mergeBase: null,
    diff: "",
    headFiles: [],
    project: { installs: [], checks: [], notes: [] },
    execution: "static-only",
    installs: [],
    installScriptsNeeded: false,
    baseline: [],
    doctrine: [],
    notes: [],
    unresolved: [],
  }),
}));

const github: GitHubClient = { fetchPr: async () => fixtureTarget() };
const models = { lead: mockModel([]), seat: mockModel([]), ids: { lead: "lead-model", seat: "seat-model" } };

describe("reviewPr with a snapshot but no merge base", () => {
  it("deletes the snapshot and stops without a model call", async () => {
    const factory = fakeFactory();
    const outcome = await reviewPr("https://github.com/acme/widgets/pull/7", { github, sandboxes: factory, models });
    expect(outcome).toMatchObject({ kind: "unresolved", problems: ["Sandbox setup did not produce a snapshot."] });
    expect(factory.deleted).toEqual(["snap_stray"]);
    expect(models.lead.doGenerateCalls).toHaveLength(0);
  });

  it("lists a failed snapshot delete among the problems", async () => {
    const factory = fakeFactory();
    factory.deleteSnapshot = async () => {
      throw new Error("auth expired");
    };
    const outcome = await reviewPr("https://github.com/acme/widgets/pull/7", { github, sandboxes: factory, models });
    expect(outcome).toMatchObject({
      kind: "unresolved",
      problems: ["Sandbox setup did not produce a snapshot.", "Snapshot snap_stray could not be deleted: auth expired"],
    });
  });
});
