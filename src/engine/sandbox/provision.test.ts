import { describe, expect, it } from "vitest";
import { fixtureTarget } from "../test-fixtures";
import { FakeFactory, FakeRunner, type FakeHandler } from "./fake";
import { FAKE_REPO_FILES, fakeFactory, fakeRepoHandler } from "./fake-repo";
import { INSTALL_NETWORK } from "./policy";
import { provision } from "./provision";

function baseOf(factory: FakeFactory): FakeRunner {
  if (!factory.base) throw new Error("no base sandbox was created");
  return factory.base;
}

/** A fake repo whose `readFile` throws for one path, the way the SDK does for a directory or an API error. */
function factoryWithUnreadable(path: string): FakeFactory {
  class Unreadable extends FakeRunner {
    override async readFile(requested: string): Promise<string | null> {
      if (requested === path) throw new Error("EISDIR: illegal operation on a directory");
      return super.readFile(requested);
    }
  }
  const handler = fakeRepoHandler();
  return new FakeFactory({ base: (network) => new Unreadable({ handler, files: FAKE_REPO_FILES, network }) });
}

describe("provision", () => {
  it("fetches, installs with scripts off, locks the network, runs checks and snapshots", async () => {
    const factory = fakeFactory();
    const result = await provision(fixtureTarget(), factory);
    const base = baseOf(factory);

    expect(result.unresolved).toEqual([]);
    expect(result.snapshotId).toBe("snap_fake");
    expect(result.headSha).toBe("headsha");
    expect(result.mergeBase).toBe("mergebase");
    expect(result.diff).toContain("Math.round");
    expect(result.headFiles).toContain("src/a.ts");
    expect(result.execution).toBe("full");
    expect(result.installs).toMatchObject([{ label: "npm ci", scriptsEnabled: false }]);
    expect(result.installScriptsNeeded).toBe(false);
    expect(result.baseline.map((b) => b.check.name)).toEqual(["lint", "test"]);
    expect(result.doctrine).toEqual([{ path: "CLAUDE.md", content: "Prices are integer cents. Never use floats for money." }]);
    expect(base.stopped).toBe(true);

    const fetch = base.log.find((e) => e.cmd.startsWith("git init"));
    expect(fetch?.cmd).toContain("'+refs/pull/7/head:refs/remotes/origin/pr'");
    expect(fetch?.network).toEqual(INSTALL_NETWORK);
    expect(base.log.find((e) => e.cmd.startsWith("npm ci --ignore-scripts"))?.network).toEqual(INSTALL_NETWORK);
    const checks = base.log.filter((e) => e.cmd.startsWith("npm run --silent"));
    expect(checks).toHaveLength(2);
    expect(checks.every((e) => e.network === "deny-all")).toBe(true);
  });

  it("falls back to install scripts when the safe install fails, and records it", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "npm ci --ignore-scripts": { exitCode: 1, output: "esbuild failed" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.installs).toMatchObject([{ label: "npm ci", scriptsEnabled: true }]);
    expect(result.installScriptsNeeded).toBe(true);
    expect(result.notes.join("\n")).toMatch(/only succeeded with dependency install scripts enabled/);
  });

  it("goes static-only when every install fails, but still snapshots for reviewers", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "npm ci": { exitCode: 1, output: "ERESOLVE" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.execution).toBe("static-only");
    expect(result.baseline).toEqual([]);
    expect(result.snapshotId).toBe("snap_fake");
    // The scripts-on retry ran dependency install scripts with the network open, so the record must say so (rule 6).
    expect(result.installs).toMatchObject([{ label: "npm ci", scriptsEnabled: true, result: { exitCode: 1 } }]);
    expect(result.installScriptsNeeded).toBe(true);
    expect(result.notes).toContain(
      "npm ci failed with dependency install scripts disabled and enabled (exit 1); node checks were skipped and reviewers work without those dependencies.",
    );
  });

  it("re-runs failing checks with install scripts enabled and records that they were needed", async () => {
    let scripts = false;
    const repo = fakeRepoHandler();
    const handler: FakeHandler = (cmd, opts) => {
      if (cmd.startsWith("npm ci --no-audit")) {
        scripts = true;
        return {};
      }
      if (cmd === "npm run --silent test") return scripts ? { output: "ok" } : { exitCode: 1, output: "esbuild binary missing" };
      return repo(cmd, opts);
    };
    const factory = fakeFactory(handler);
    const result = await provision(fixtureTarget(), factory);
    expect(result.installScriptsNeeded).toBe(true);
    expect(result.baseline.find((b) => b.check.name === "test")?.result.exitCode).toBe(0);
    expect(result.notes.join("\n")).toMatch(/only passed after enabling dependency install scripts/);
    const base = baseOf(factory);
    expect(base.log.find((e) => e.cmd.startsWith("npm ci --no-audit"))?.network).toEqual(INSTALL_NETWORK);
    // The re-run of the failed check happens after the scripts-on reinstall, so the network must be locked again by then.
    const testRuns = base.log.filter((e) => e.cmd === "npm run --silent test");
    expect(testRuns).toHaveLength(2);
    expect(testRuns.at(-1)?.network).toBe("deny-all");
  });

  it("stops with an unresolved problem when no merge base exists, after deepening once", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git merge-base": { exitCode: 1, output: "fatal: no merge base" } }));
    const result = await provision(fixtureTarget(), factory);
    const base = baseOf(factory);
    expect(result.unresolved[0]).toMatch(/merge base/);
    expect(result.snapshotId).toBeNull();
    expect(base.commands().some((c) => c.includes("--deepen=2000"))).toBe(true);
    expect(base.commands().some((c) => c.startsWith("npm ci"))).toBe(false);
    expect(base.stopped).toBe(true);
  });

  it("diffs an open PR against the tip of its base branch", async () => {
    const factory = fakeFactory();
    await provision(fixtureTarget({ state: "open" }), factory);
    const commands = baseOf(factory).commands();
    expect(commands.find((c) => c.startsWith("git init"))).toContain("'+refs/heads/main:refs/remotes/origin/base'");
    expect(commands).toContain("git merge-base origin/base HEAD");
    expect(commands.some((c) => c.includes("'basesha'"))).toBe(false);
  });

  it.each(["merged", "closed"] as const)("diffs a %s PR against the base commit GitHub recorded, not today's base tip", async (state) => {
    // With a merge commit, today's base tip contains the PR head, so its merge base is the head and the diff is empty.
    const factory = fakeFactory(
      fakeRepoHandler({
        "git merge-base origin/base HEAD": { output: "headsha\n" },
        "git merge-base 'basesha' HEAD": { output: "forkpoint\n" },
      }),
    );
    const result = await provision(fixtureTarget({ state }), factory);
    const base = baseOf(factory);
    expect(result.unresolved).toEqual([]);
    expect(result.mergeBase).toBe("forkpoint");
    expect(base.commands()).toContain("git diff --no-color --no-ext-diff 'forkpoint' HEAD");
    const baseFetch = base.log.find((e) => e.cmd.startsWith("git fetch") && e.cmd.includes("'basesha'"));
    expect(baseFetch?.cmd).toBe("git fetch -q --no-tags --depth=200 origin 'basesha'");
    expect(baseFetch?.network).toEqual(INSTALL_NETWORK);
    expect(base.commands()).not.toContain("git merge-base origin/base HEAD");
    // The base sha is fetched before anything from the repo runs.
    expect(base.commands().indexOf(baseFetch?.cmd ?? "")).toBeLessThan(base.commands().findIndex((c) => c.startsWith("npm ci")));
  });

  it("deepens both the PR head and the recorded base commit when a merged PR has no merge base yet", async () => {
    let deepened = false;
    const repo = fakeRepoHandler();
    const handler: FakeHandler = (cmd, opts) => {
      if (cmd.includes("--deepen=")) {
        deepened = true;
        return {};
      }
      if (cmd.startsWith("git merge-base")) return deepened ? { output: "forkpoint\n" } : { exitCode: 1, output: "fatal: no merge base" };
      return repo(cmd, opts);
    };
    const factory = fakeFactory(handler);
    const result = await provision(fixtureTarget({ state: "merged" }), factory);
    expect(result.mergeBase).toBe("forkpoint");
    expect(baseOf(factory).commands()).toContain("git fetch -q --no-tags --deepen=2000 origin 'basesha' '+refs/pull/7/head:refs/remotes/origin/pr'");
  });

  it("stops as unresolved when the recorded base commit of a merged PR cannot be fetched", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "origin 'basesha'": { exitCode: 128, output: "fatal: remote error: upload-pack: not our ref basesha" } }));
    const result = await provision(fixtureTarget({ state: "merged" }), factory);
    expect(result.unresolved).toEqual(["Could not fetch the PR's base commit basesha: fatal: remote error: upload-pack: not our ref basesha"]);
    expect(result.snapshotId).toBeNull();
    expect(baseOf(factory).commands().some((c) => c.startsWith("npm ci"))).toBe(false);
    expect(baseOf(factory).stopped).toBe(true);
  });

  it("stops as unresolved instead of reviewing nothing when the merge base is the PR head", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git merge-base": { output: "headsha\n" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]).toMatch(/merge base is the PR head headsha/);
    expect(result.snapshotId).toBeNull();
    expect(result.diff).toBe("");
    expect(baseOf(factory).commands().some((c) => c.startsWith("git diff") || c.startsWith("npm ci"))).toBe(false);
    expect(baseOf(factory).stopped).toBe(true);
  });

  it("stops as unresolved when the diff is empty although GitHub lists changed files", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git diff": { output: "\n" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.unresolved).toEqual([
      "The diff from merge base mergebase to the PR head is empty, but GitHub lists 1 changed file; a review of it would see nothing.",
    ]);
    expect(result.snapshotId).toBeNull();
    expect(baseOf(factory).commands().some((c) => c.startsWith("npm ci"))).toBe(false);
    expect(baseOf(factory).stopped).toBe(true);
  });

  it("notes when the PR head moved and reviews the commit it actually checked out", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git rev-parse HEAD": { output: "othersha\n" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.headSha).toBe("othersha");
    expect(result.notes.join("\n")).toMatch(/head moved/);
  });

  it("restores the tracked tree to the reviewed commit and re-checks it", async () => {
    let reset = false;
    const repo = fakeRepoHandler();
    const handler: FakeHandler = (cmd, opts) => {
      if (cmd.startsWith("git reset")) {
        reset = true;
        return {};
      }
      if (cmd.startsWith("git status --porcelain")) return reset ? {} : { output: " M package-lock.json\n" };
      return repo(cmd, opts);
    };
    const factory = fakeFactory(handler);
    const result = await provision(fixtureTarget(), factory);
    const commands = baseOf(factory).commands();
    expect(result.notes.join("\n")).toMatch(/modified tracked files \(reverted before review\)/);
    expect(result.notes.join("\n")).not.toMatch(/could not be restored/);
    expect(commands).toContain("git reset -q --hard 'headsha'");
    expect(commands).not.toContain("git checkout -- .");
    expect(commands.filter((c) => c.startsWith("git status --porcelain"))).toHaveLength(2);
  });

  it("says so when the tracked tree is still modified after the reset", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git status --porcelain": { output: " M package-lock.json\n" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.notes.join("\n")).toMatch(/modified tracked files \(reverted before review\)/);
    expect(result.notes.join("\n")).toMatch(/tracked tree could not be restored/);
    expect(result.snapshotId).toBe("snap_fake");
  });

  it("resets to the reviewed commit even when status is clean, because repo code can commit", async () => {
    const factory = fakeFactory();
    const result = await provision(fixtureTarget(), factory);
    expect(baseOf(factory).commands()).toContain("git reset -q --hard 'headsha'");
    expect(result.notes.join("\n")).not.toMatch(/modified tracked files|could not be restored/);
  });

  it("says so when the reset itself fails", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git reset": { exitCode: 128, output: "fatal: unable to write index" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.notes.join("\n")).toMatch(/tracked tree could not be restored to headsha.*unable to write index/);
    expect(result.snapshotId).toBe("snap_fake");
  });

  it("records a failed scripts-on reinstall instead of staying silent", async () => {
    const factory = fakeFactory(
      fakeRepoHandler({
        "npm ci --no-audit": { exitCode: 1, output: "postinstall exploded" },
        "npm run --silent test": { exitCode: 1, output: "esbuild binary missing" },
      }),
    );
    const result = await provision(fixtureTarget(), factory);
    expect(result.installs).toMatchObject([
      { label: "npm ci", scriptsEnabled: false },
      { label: "npm ci", scriptsEnabled: true, result: { exitCode: 1 } },
    ]);
    expect(result.installScriptsNeeded).toBe(true);
    expect(result.notes.join("\n")).toContain(
      "npm ci with dependency install scripts enabled failed (exit 1); node_modules may be incomplete and the baseline shows the run before the reinstall.",
    );
    expect(result.execution).toBe("full");
    expect(result.baseline.find((b) => b.check.name === "test")?.result.exitCode).toBe(1);
    expect(baseOf(factory).network).toBe("deny-all");
    expect(result.snapshotId).toBe("snap_fake");
  });

  it("does not reinstall with scripts because a Python check failed", async () => {
    const handler = fakeRepoHandler({
      "ls -1A": { output: "CLAUDE.md\npackage-lock.json\npackage.json\nrequirements.txt\n" },
      "-m pytest": { exitCode: 1, output: "1 failed" },
    });
    const files = { ...FAKE_REPO_FILES, "requirements.txt": "pytest\n" };
    const factory = new FakeFactory({ base: (network) => new FakeRunner({ handler, files, network }) });
    const result = await provision(fixtureTarget(), factory);
    expect(result.baseline.find((b) => b.check.ecosystem === "python")?.result.exitCode).toBe(1);
    expect(result.baseline.filter((b) => b.check.ecosystem === "node").every((b) => b.result.exitCode === 0)).toBe(true);
    expect(baseOf(factory).commands().some((c) => c.startsWith("npm ci --no-audit"))).toBe(false);
    expect(result.installScriptsNeeded).toBe(false);
    expect(result.installs.every((i) => !i.scriptsEnabled)).toBe(true);
  });

  it.each([
    ["the fetch", { "git fetch": { exitCode: 128, output: "fatal: repository not found" } }, /Could not fetch the pull request/],
    ["git rev-parse HEAD", { "git rev-parse HEAD": { exitCode: -1, output: "[proofread] sandbox error: gone" } }, /git rev-parse HEAD failed \(exit -1\)/],
    ["git diff", { "git diff": { exitCode: -1, output: "[proofread] sandbox error: gone" } }, /git diff failed \(exit -1\)/],
    ["git ls-files", { "git ls-files": { exitCode: -1, output: "[proofread] sandbox error: gone" } }, /git ls-files failed \(exit -1\)/],
  ])("stops as unresolved, without installing, when %s fails", async (_step, overrides, problem) => {
    const factory = fakeFactory(fakeRepoHandler(overrides));
    const result = await provision(fixtureTarget(), factory);
    const base = baseOf(factory);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]).toMatch(problem);
    expect(result.snapshotId).toBeNull();
    expect(result.diff).toBe("");
    expect(result.notes.join("\n")).not.toMatch(/head moved/);
    expect(base.commands().some((c) => c.startsWith("npm ci"))).toBe(false);
    expect(base.stopped).toBe(true);
  });

  it("reads the yarn config from the sandbox so a repo-supplied yarn release is recorded", async () => {
    const handler = fakeRepoHandler({ "ls -1A": { output: ".yarnrc.yml\nCLAUDE.md\npackage.json\nyarn.lock\n" } });
    const files = { ...FAKE_REPO_FILES, ".yarnrc.yml": "yarnPath: .yarn/releases/yarn-4.cjs\n" };
    const factory = new FakeFactory({ base: (network) => new FakeRunner({ handler, files, network }) });
    const result = await provision(fixtureTarget(), factory);
    expect(result.installs).toMatchObject([{ label: "yarn install", scriptsEnabled: false }]);
    expect(result.notes.join("\n")).toMatch(/Yarn loads the repository's own yarn release or plugins/);
  });

  it("skips and records a doctrine file the sandbox cannot read instead of failing", async () => {
    const factory = factoryWithUnreadable("CLAUDE.md");
    const result = await provision(fixtureTarget(), factory);
    expect(result.doctrine).toEqual([]);
    expect(result.notes.join("\n")).toMatch(/CLAUDE\.md could not be read/);
    expect(result.snapshotId).toBe("snap_fake");
  });

  it("treats an unreadable root manifest as missing and says so", async () => {
    const factory = factoryWithUnreadable("package.json");
    const result = await provision(fixtureTarget(), factory);
    expect(result.notes.join("\n")).toMatch(/package\.json could not be read/);
    expect(result.execution).toBe("static-only");
    expect(result.snapshotId).toBe("snap_fake");
  });
});
