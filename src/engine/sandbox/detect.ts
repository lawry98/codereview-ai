import type { Ecosystem } from "../types";
import { shq } from "../util/text";

/** `safe` runs first with dependency install scripts off (security rule 6); `withScripts` only if needed. */
export type InstallStep = { ecosystem: Ecosystem; label: string; safe: string; withScripts: string };
export type CheckName = "typecheck" | "lint" | "test";
export type Check = { name: CheckName; ecosystem: Ecosystem; cmd: string };
export type ProjectInfo = { installs: InstallStep[]; checks: Check[]; notes: string[] };
export type ProjectFiles = { rootFiles: string[]; read: (path: string) => string | null };

type NodePm = "npm" | "pnpm" | "yarn" | "yarn-berry";

const NPM_PLACEHOLDER_TEST = /no test specified/;
const MANIFEST_FILE = /^(?:package\.json|pyproject\.toml|setup\.py|requirements[^/]*\.txt)$/;
const YARN_LOADS_REPO_CODE_NOTE =
  "Yarn loads the repository's own yarn release or plugins (yarnPath/plugins in .yarnrc.yml, yarn-path in .yarnrc), so repository code runs during install even with build scripts skipped.";
const UV_BUILDS_PROJECT_NOTE = "uv sync builds and installs the project itself, so its build backend runs even in the scripts-off pass.";

/** Each pattern marks a requirement line that can make pip build a package from source. */
const PIP_BUILD_HINTS: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  ["--editable", /^(?:-e|--editable\b)/],
  ["--no-binary", /^--no-binary\b/],
  ["a nested -r/-c file", /^(?:-[rc]|--requirement\b|--constraint\b)/],
  ["a VCS URL", /(?:^|[\s@])(?:git|hg|svn|bzr)\+/],
  ["a URL", /:\/\//],
  ["a local path", /^(?:\.{1,2}(?:\/|$)|\/|file:)|@\s*(?:\.{0,2}\/|file:)/],
];

export function detectProject(files: ProjectFiles): ProjectInfo {
  const info: ProjectInfo = { installs: [], checks: [], notes: [] };
  detectNode(files, info);
  detectPython(files, info);
  if (!files.rootFiles.some((f) => MANIFEST_FILE.test(f))) {
    info.notes.push("No package.json, pyproject.toml or requirements file at the repo root; nothing was installed.");
  }
  return info;
}

function detectNode(files: ProjectFiles, info: ProjectInfo): void {
  const raw = files.read("package.json");
  if (raw === null) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    info.notes.push("package.json is not valid JSON; JS dependencies were not installed.");
    return;
  }
  if (!isRecord(parsed)) {
    info.notes.push("package.json is not valid JSON (expected an object); JS dependencies were not installed.");
    return;
  }
  const pkg = parsed;
  const pm = nodePm(files.rootFiles, pkg);
  info.installs.push(nodeInstall(pm, files.rootFiles.includes("package-lock.json")));
  if ((pm === "yarn" || pm === "yarn-berry") && yarnLoadsRepoCode(files)) info.notes.push(YARN_LOADS_REPO_CODE_NOTE);

  // Only fixed, known script names are ever run: the names come from an untrusted package.json.
  const scripts: Record<string, unknown> = isRecord(pkg.scripts) ? pkg.scripts : {};
  const has = (name: string) => typeof scripts[name] === "string";
  const typecheck = ["typecheck", "type-check", "tsc"].find(has);
  if (typecheck) info.checks.push({ name: "typecheck", ecosystem: "node", cmd: runScript(pm, typecheck) });
  else if (files.rootFiles.includes("tsconfig.json")) info.checks.push({ name: "typecheck", ecosystem: "node", cmd: execBin(pm, "tsc --noEmit") });
  if (has("lint")) info.checks.push({ name: "lint", ecosystem: "node", cmd: runScript(pm, "lint") });
  if (has("test") && !NPM_PLACEHOLDER_TEST.test(String(scripts.test))) info.checks.push({ name: "test", ecosystem: "node", cmd: runScript(pm, "test") });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodePm(rootFiles: string[], pkg: Record<string, unknown>): NodePm {
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager : "";
  if (rootFiles.includes("pnpm-lock.yaml") || declared.startsWith("pnpm@")) return "pnpm";
  if (rootFiles.includes("yarn.lock") || declared.startsWith("yarn@")) {
    return rootFiles.includes(".yarnrc.yml") || /^yarn@[2-9]/.test(declared) ? "yarn-berry" : "yarn";
  }
  return "npm";
}

/** Yarn reads these keys and then runs a release or plugin shipped inside the repository. */
function yarnLoadsRepoCode(files: ProjectFiles): boolean {
  const berryConfig = files.read(".yarnrc.yml") ?? "";
  const classicConfig = files.read(".yarnrc") ?? "";
  return /^\s*(?:yarnPath|plugins)\s*:/m.test(berryConfig) || /^\s*yarn-path\b/m.test(classicConfig);
}

function nodeInstall(pm: NodePm, hasNpmLock: boolean): InstallStep {
  switch (pm) {
    case "pnpm":
      return { ecosystem: "node", label: "pnpm install", safe: "corepack enable && pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile", withScripts: "corepack enable && pnpm install --frozen-lockfile" };
    case "yarn":
      return { ecosystem: "node", label: "yarn install", safe: "corepack enable && yarn install --frozen-lockfile --ignore-scripts", withScripts: "corepack enable && yarn install --frozen-lockfile" };
    case "yarn-berry":
      return { ecosystem: "node", label: "yarn install", safe: "corepack enable && yarn install --immutable --mode=skip-build", withScripts: "corepack enable && yarn install --immutable" };
    case "npm":
      return hasNpmLock
        ? { ecosystem: "node", label: "npm ci", safe: "npm ci --ignore-scripts --no-audit --no-fund", withScripts: "npm ci --no-audit --no-fund" }
        : { ecosystem: "node", label: "npm install", safe: "npm install --ignore-scripts --no-audit --no-fund", withScripts: "npm install --no-audit --no-fund" };
  }
}

function runScript(pm: NodePm, script: string): string {
  if (pm === "npm") return `npm run --silent ${script}`;
  if (pm === "pnpm") return `pnpm run --silent ${script}`;
  return `yarn run ${script}`;
}

function execBin(pm: NodePm, bin: string): string {
  if (pm === "npm") return `npx --no-install ${bin}`;
  if (pm === "pnpm") return `pnpm exec ${bin}`;
  return `yarn ${bin}`;
}

function detectPython(files: ProjectFiles, info: ProjectInfo): void {
  const has = (name: string) => files.rootFiles.includes(name);
  const pyproject = files.read("pyproject.toml") ?? "";
  const requirements = files.rootFiles.filter((f) => /^requirements[^/]*\.txt$/.test(f)).sort();
  if (!has("pyproject.toml") && requirements.length === 0 && !has("setup.py")) return;

  const venv = "python3 -m venv .venv";
  if (has("uv.lock")) {
    const uv = `(command -v uv >/dev/null || python3 -m pip install -q --user --break-system-packages uv) && export PATH="$HOME/.local/bin:$PATH" && uv sync --frozen --all-extras`;
    info.installs.push({ ecosystem: "python", label: "uv sync", safe: `${uv} --no-build`, withScripts: uv });
    if (/^\s*\[build-system\]/m.test(pyproject)) info.notes.push(UV_BUILDS_PROJECT_NOTE);
  } else if (requirements.length > 0) {
    const reqs = requirements.map((r) => `-r ${shq(r)}`).join(" ");
    info.installs.push({
      ecosystem: "python",
      label: "pip install -r",
      safe: `${venv} && .venv/bin/pip install -q --only-binary=:all: ${reqs}`,
      withScripts: `${venv} && .venv/bin/pip install -q ${reqs}`,
    });
    for (const file of requirements) {
      const hints = pipBuildHints(files.read(file) ?? "");
      if (hints.length > 0) {
        info.notes.push(`${file} can make pip build packages from source (${hints.join(", ")}), so Python install scripts may run even in the scripts-off pass.`);
      }
    }
  } else {
    const editable = `${venv} && (.venv/bin/pip install -q -e ".[dev,test]" || .venv/bin/pip install -q -e .)`;
    info.installs.push({ ecosystem: "python", label: "pip install -e .", safe: editable, withScripts: editable });
    info.notes.push("Installing the project itself builds it from source, so Python install scripts cannot be switched off for this repo.");
  }

  const dependencyText = [pyproject, ...requirements.map((r) => files.read(r) ?? "")].join("\n");
  const py = ".venv/bin/python -m";
  if (/\[tool\.mypy\]/.test(pyproject) || has("mypy.ini")) info.checks.push({ name: "typecheck", ecosystem: "python", cmd: `${py} mypy .` });
  if (/\[tool\.ruff/.test(pyproject) || has("ruff.toml") || has(".ruff.toml")) info.checks.push({ name: "lint", ecosystem: "python", cmd: `${py} ruff check .` });
  if (/\bpytest\b/.test(dependencyText) || has("pytest.ini") || has("conftest.py") || has("tests")) {
    info.checks.push({ name: "test", ecosystem: "python", cmd: `${py} pytest -q -p no:cacheprovider` });
  }
}

/** Labels of the build-from-source hints in a requirements file. */
function pipBuildHints(text: string): string[] {
  const found = new Set<string>();
  for (const logical of pipLogicalLines(text)) {
    const line = logical.replace(/(?:^|\s)#.*$/, "").trim();
    for (const [label, pattern] of PIP_BUILD_HINTS) {
      if (pattern.test(line)) found.add(label);
    }
  }
  return [...found];
}

/**
 * Logical lines as pip's join_lines builds them: a non-comment line ending in a backslash continues onto
 * the next line, with every leading and trailing backslash stripped. A comment line is never continued,
 * and one that follows a continuation is appended to it and ends it.
 */
function pipLogicalLines(text: string): string[] {
  const logical: string[] = [];
  let pending: string | null = null;
  for (const physical of text.split(/\r?\n/)) {
    const isComment = /^\s*#/.test(physical);
    if (!isComment && physical.endsWith("\\")) {
      pending = (pending ?? "") + physical.replace(/^\\+|\\+$/g, "");
      continue;
    }
    if (pending === null) logical.push(physical);
    else logical.push(pending + (isComment ? " " : "") + physical);
    pending = null;
  }
  if (pending !== null) logical.push(pending);
  return logical;
}
