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
    expect(baseOf(factory).log.find((e) => e.cmd.startsWith("npm ci --no-audit"))?.network).toEqual(INSTALL_NETWORK);
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

  it("notes when the PR head moved and reviews the commit it actually checked out", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git rev-parse HEAD": { output: "othersha\n" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.headSha).toBe("othersha");
    expect(result.notes.join("\n")).toMatch(/head moved/);
  });

  it("reverts tracked files modified by install or checks", async () => {
    const factory = fakeFactory(fakeRepoHandler({ "git status --porcelain": { output: " M package-lock.json\n" } }));
    const result = await provision(fixtureTarget(), factory);
    expect(result.notes.join("\n")).toMatch(/modified tracked files/);
    expect(baseOf(factory).commands()).toContain("git checkout -- .");
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
