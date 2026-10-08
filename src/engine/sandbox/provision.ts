import type { CommandResult, Ecosystem, PrTarget } from "../types";
import { shq } from "../util/text";
import { detectProject, type Check, type ProjectInfo } from "./detect";
import { INSTALL_NETWORK, LOCKED_NETWORK, SANDBOX_LIMITS } from "./policy";
import type { SandboxFactory, SandboxRunner } from "./runner";

export type CheckResult = { check: Check; result: CommandResult };

export type ProvisionResult = {
  snapshotId: string | null;
  headSha: string;
  mergeBase: string | null;
  diff: string;
  headFiles: string[];
  project: ProjectInfo;
  execution: "full" | "static-only";
  installs: Array<{ label: string; result: CommandResult; scriptsEnabled: boolean }>;
  installScriptsNeeded: boolean;
  baseline: CheckResult[];
  doctrine: Array<{ path: string; content: string }>;
  notes: string[];
  unresolved: string[];
};

/** Root files `detectProject` reads. `.yarnrc*` show whether yarn loads repo-supplied code during install. */
const ROOT_MANIFESTS = ["package.json", "pyproject.toml", "setup.py", ".yarnrc.yml", ".yarnrc"];
const DOCTRINE_LIST = [
  "ls -1d CLAUDE.md AGENTS.md GEMINI.md CONTRIBUTING.md .github/CONTRIBUTING.md CODING_STANDARDS.md STANDARDS.md .cursorrules 2>/dev/null",
  "find docs .claude/docs -maxdepth 3 -type f -name '*.md' \\( -path '*adr*' -o -path '*decisions*' \\) 2>/dev/null",
  "find . -maxdepth 2 -name CONTEXT.md -not -path './node_modules/*' -not -path './.venv/*' 2>/dev/null | sed 's|^\\./||'",
].join("; ");
const DOCTRINE_FILE_CHARS = 20_000;
const DOCTRINE_TOTAL_CHARS = 60_000;
const DEEPEN_COMMITS = 2_000;

export async function provision(target: PrTarget, factory: SandboxFactory): Promise<ProvisionResult> {
  const notes: string[] = [];
  const base = await factory.createBase(INSTALL_NETWORK);
  try {
    const sources = await fetchSources(base, target, notes);
    if (!sources.ok) {
      await base.stop();
      return unresolvedResult(target.headSha, notes, sources.problem);
    }
    const { headSha, mergeBase } = sources;

    const diff = await base.run(`git diff --no-color --no-ext-diff ${shq(mergeBase)} HEAD`, { maxOutputBytes: 400_000 });
    if (diff.truncated) notes.push("The diff was too large to hand to reviewers in full; they saw its tail and read files directly.");
    const headFiles = lines((await base.run("git ls-files", { maxOutputBytes: 4_000_000 })).output);

    // detectProject is synchronous, so the root manifests are read from the sandbox up front; repo files are never read on the host.
    const rootFiles = lines((await base.run("ls -1A", { maxOutputBytes: 200_000 })).output);
    const contents = new Map<string, string | null>();
    for (const path of [...ROOT_MANIFESTS, ...rootFiles.filter((f) => /^requirements[^/]*\.txt$/.test(f))]) {
      contents.set(path, rootFiles.includes(path) ? await readOrNote(base, path, notes) : null);
    }
    const project = detectProject({ rootFiles, read: (p) => contents.get(p) ?? null });
    notes.push(...project.notes);

    const installs: ProvisionResult["installs"] = [];
    const failedEcosystems = new Set<Ecosystem>();
    let installScriptsNeeded = false;
    for (const step of project.installs) {
      const safe = await base.run(step.safe, { timeoutMs: SANDBOX_LIMITS.installTimeoutMs });
      if (safe.exitCode === 0) {
        installs.push({ label: step.label, result: safe, scriptsEnabled: false });
        continue;
      }
      const full = await base.run(step.withScripts, { timeoutMs: SANDBOX_LIMITS.installTimeoutMs });
      installs.push({ label: step.label, result: full, scriptsEnabled: true });
      if (full.exitCode === 0) {
        installScriptsNeeded = true;
        notes.push(`${step.label} only succeeded with dependency install scripts enabled.`);
      } else {
        failedEcosystems.add(step.ecosystem);
        notes.push(`${step.label} failed (exit ${full.exitCode}); ${step.ecosystem} checks were skipped and reviewers work without those dependencies.`);
      }
    }
    const execution: ProvisionResult["execution"] =
      project.installs.length === 0 || project.installs.every((s) => failedEcosystems.has(s.ecosystem)) ? "static-only" : "full";

    await base.setNetwork(LOCKED_NETWORK);
    let baseline = await runChecks(base, project.checks.filter((c) => !failedEcosystems.has(c.ecosystem)));

    // Packages like esbuild install "successfully" with scripts off and then fail at runtime.
    const failing = baseline.filter((b) => b.result.exitCode !== 0);
    const retryable = project.installs.filter(
      (s) => s.ecosystem === "node" && !failedEcosystems.has("node") && !installs.find((i) => i.label === s.label)?.scriptsEnabled,
    );
    if (failing.length > 0 && retryable.length > 0) {
      await base.setNetwork(INSTALL_NETWORK);
      const reinstalls: CommandResult[] = [];
      for (const step of retryable) reinstalls.push(await base.run(step.withScripts, { timeoutMs: SANDBOX_LIMITS.installTimeoutMs }));
      await base.setNetwork(LOCKED_NETWORK);
      if (reinstalls.every((r) => r.exitCode === 0)) {
        const rerun = await runChecks(base, failing.map((f) => f.check));
        baseline = baseline.map((b) => rerun.find((r) => r.check === b.check) ?? b);
        const fixed = rerun.filter((r) => r.result.exitCode === 0);
        if (fixed.length > 0) {
          installScriptsNeeded = true;
          notes.push(`Checks ${fixed.map((f) => f.check.name).join(", ")} only passed after enabling dependency install scripts.`);
        } else {
          notes.push("Re-installing with dependency install scripts enabled did not change the failing checks.");
        }
      }
    }

    const dirty = await base.run("git status --porcelain --untracked-files=no");
    if (dirty.output.trim() !== "") {
      notes.push(`Install or checks modified tracked files (reverted before review): ${lines(dirty.output).join("; ")}`);
      await base.run("git checkout -- .");
    }

    const doctrine = await readDoctrine(base, notes);
    const snapshotId = await base.snapshot();
    return {
      snapshotId,
      headSha,
      mergeBase,
      diff: diff.output,
      headFiles,
      project,
      execution,
      installs,
      installScriptsNeeded,
      baseline,
      doctrine,
      notes,
      unresolved: [],
    };
  } catch (error) {
    await base.stop().catch(() => undefined);
    throw error;
  }
}

async function fetchSources(
  base: SandboxRunner,
  target: PrTarget,
  notes: string[],
): Promise<{ ok: true; headSha: string; mergeBase: string } | { ok: false; problem: string }> {
  // refs/pull/<n>/head lives on the base repo, so fork PRs need no access to the fork.
  const refspecs = `${shq(`+refs/heads/${target.baseRef}:refs/remotes/origin/base`)} ${shq(`+refs/pull/${target.number}/head:refs/remotes/origin/pr`)}`;
  const fetched = await base.run(
    `git init -q . && git remote add origin ${shq(target.cloneUrl)} && git fetch -q --no-tags --depth=200 origin ${refspecs}`,
    { timeoutMs: SANDBOX_LIMITS.installTimeoutMs },
  );
  if (fetched.exitCode !== 0) return { ok: false, problem: `Could not fetch the pull request from ${target.cloneUrl}: ${lastLine(fetched.output)}` };

  const checkout = await base.run(`git checkout -q --detach ${shq(target.headSha)} 2>/dev/null || git checkout -q --detach origin/pr`);
  if (checkout.exitCode !== 0) return { ok: false, problem: `Could not check out the PR head: ${lastLine(checkout.output)}` };
  const headSha = (await base.run("git rev-parse HEAD")).output.trim();
  if (headSha !== target.headSha) {
    notes.push(`The PR head moved after its metadata was fetched; reviewing ${headSha.slice(0, 12)} instead of ${target.headSha.slice(0, 12)}.`);
  }

  let mergeBase = await base.run("git merge-base origin/base HEAD");
  if (mergeBase.exitCode !== 0) {
    await base.run(`git fetch -q --no-tags --deepen=${DEEPEN_COMMITS} origin ${refspecs}`, { timeoutMs: SANDBOX_LIMITS.installTimeoutMs });
    mergeBase = await base.run("git merge-base origin/base HEAD");
  }
  if (mergeBase.exitCode !== 0) {
    return { ok: false, problem: `Could not compute a merge base between the PR and ${target.baseRef} within ${DEEPEN_COMMITS + 200} commits of history.` };
  }
  return { ok: true, headSha, mergeBase: mergeBase.output.trim() };
}

async function runChecks(base: SandboxRunner, checks: Check[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const check of checks) results.push({ check, result: await base.run(check.cmd, { timeoutMs: SANDBOX_LIMITS.checkTimeoutMs }) });
  return results;
}

/** `readFile` may throw (a directory where a file is expected, an API error): record it and carry on without that file. */
async function readOrNote(base: SandboxRunner, path: string, notes: string[]): Promise<string | null> {
  try {
    return await base.readFile(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    notes.push(`${path} could not be read (${reason}) and was skipped.`);
    return null;
  }
}

async function readDoctrine(base: SandboxRunner, notes: string[]): Promise<Array<{ path: string; content: string }>> {
  const paths = [...new Set(lines((await base.run(DOCTRINE_LIST)).output))].sort();
  const doctrine: Array<{ path: string; content: string }> = [];
  let total = 0;
  for (const [index, path] of paths.entries()) {
    const content = await readOrNote(base, path, notes);
    if (content === null) continue;
    const clipped = content.length > DOCTRINE_FILE_CHARS ? `${content.slice(0, DOCTRINE_FILE_CHARS)}\n[... clipped ...]` : content;
    if (total + clipped.length > DOCTRINE_TOTAL_CHARS) {
      notes.push(`Doctrine beyond ${DOCTRINE_TOTAL_CHARS} characters was not passed to reviewers: ${paths.slice(index).join(", ")}`);
      break;
    }
    total += clipped.length;
    doctrine.push({ path, content: clipped });
  }
  return doctrine;
}

function unresolvedResult(headSha: string, notes: string[], problem: string): ProvisionResult {
  return {
    snapshotId: null,
    headSha,
    mergeBase: null,
    diff: "",
    headFiles: [],
    project: { installs: [], checks: [], notes: [] },
    execution: "static-only",
    installs: [],
    installScriptsNeeded: false,
    baseline: [],
    doctrine: [],
    notes,
    unresolved: [problem],
  };
}

function lines(output: string): string[] {
  return output.split("\n").map((l) => l.trim()).filter(Boolean);
}

function lastLine(output: string): string {
  return lines(output).at(-1) ?? "no output";
}
