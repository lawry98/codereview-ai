import type { CommandResult } from "../types";
import { FakeFactory, FakeRunner, type FakeHandler } from "./fake";

export const FAKE_REPO_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ scripts: { lint: "eslint .", test: "vitest run" } }),
  "CLAUDE.md": "Prices are integer cents. Never use floats for money.",
};

/** A small npm repo at head `headsha`. Overrides match on substring and win over the defaults. */
export function fakeRepoHandler(overrides: Record<string, Partial<Omit<CommandResult, "cmd">>> = {}): FakeHandler {
  return (cmd) => {
    for (const [pattern, result] of Object.entries(overrides)) if (cmd.includes(pattern)) return result;
    if (cmd === "git rev-parse HEAD") return { output: "headsha\n" };
    if (cmd.startsWith("git merge-base")) return { output: "mergebase\n" };
    if (cmd.startsWith("git diff")) return { output: "diff --git a/src/a.ts b/src/a.ts\n-  return Math.floor(x)\n+  return Math.round(x)\n" };
    if (cmd === "git ls-files") return { output: "CLAUDE.md\npackage-lock.json\npackage.json\nsrc/a.ts\n" };
    if (cmd === "ls -1A") return { output: "CLAUDE.md\npackage-lock.json\npackage.json\nsrc\n" };
    if (cmd.startsWith("ls -1d CLAUDE.md")) return { output: "CLAUDE.md\n" };
    return undefined;
  };
}

export function fakeFactory(handler: FakeHandler = fakeRepoHandler(), seat?: () => FakeRunner): FakeFactory {
  return new FakeFactory({ base: (network) => new FakeRunner({ handler, files: FAKE_REPO_FILES, network }), seat });
}
