import { describe, expect, it } from "vitest";
import { detectProject } from "./detect";

function project(files: Record<string, string>, extraRoot: string[] = []) {
  return detectProject({ rootFiles: [...Object.keys(files), ...extraRoot], read: (p) => files[p] ?? null });
}

const YARN_NOTE = "Yarn loads the repository's own yarn release or plugins (yarnPath/plugins in .yarnrc.yml, yarn-path in .yarnrc), so repository code runs during install even with build scripts skipped.";
const UV_NOTE = "uv sync builds and installs the project itself, so its build backend runs even in the scripts-off pass.";

describe("detectProject — node", () => {
  it("uses npm ci with scripts off and runs the known scripts", () => {
    const info = project({
      "package.json": JSON.stringify({ scripts: { typecheck: "tsc", lint: "eslint .", test: "vitest run", deploy: "rm -rf /" } }),
      "package-lock.json": "{}",
    });
    expect(info.installs).toEqual([
      { ecosystem: "node", label: "npm ci", safe: "npm ci --ignore-scripts --no-audit --no-fund", withScripts: "npm ci --no-audit --no-fund" },
    ]);
    expect(info.checks).toEqual([
      { name: "typecheck", ecosystem: "node", cmd: "npm run --silent typecheck" },
      { name: "lint", ecosystem: "node", cmd: "npm run --silent lint" },
      { name: "test", ecosystem: "node", cmd: "npm run --silent test" },
    ]);
  });

  it("detects pnpm from its lockfile", () => {
    const info = project({ "package.json": JSON.stringify({ scripts: { test: "vitest" } }), "pnpm-lock.yaml": "" });
    expect(info.installs[0].safe).toBe("corepack enable && pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile");
    expect(info.checks).toEqual([{ name: "test", ecosystem: "node", cmd: "pnpm run --silent test" }]);
  });

  it("detects yarn berry", () => {
    const info = project({ "package.json": "{}", "yarn.lock": "", ".yarnrc.yml": "" });
    expect(info.installs[0]).toMatchObject({ safe: "corepack enable && yarn install --immutable --mode=skip-build", withScripts: "corepack enable && yarn install --immutable" });
  });

  it("notes when yarn berry loads its own release via yarnPath", () => {
    const info = project({ "package.json": "{}", "yarn.lock": "", ".yarnrc.yml": "yarnPath: .yarn/releases/yarn-4.js\n" });
    expect(info.notes).toContain(YARN_NOTE);
  });

  it("notes when yarn berry loads plugins from the repository", () => {
    const info = project({ "package.json": "{}", "yarn.lock": "", ".yarnrc.yml": "plugins:\n  - path: .yarn/plugins/x.cjs\n" });
    expect(info.notes).toContain(YARN_NOTE);
  });

  it("notes when classic yarn loads its own release via yarn-path", () => {
    const info = project({ "package.json": "{}", "yarn.lock": "", ".yarnrc": "yarn-path ./bin/yarn.js\n" });
    expect(info.notes).toContain(YARN_NOTE);
  });

  it("adds no yarn note when the repository's yarn config does not load code", () => {
    const info = project({ "package.json": "{}", "yarn.lock": "", ".yarnrc.yml": "nodeLinker: node-modules\n" });
    expect(info.notes).toEqual([]);
  });

  it("skips npm's placeholder test script and falls back to tsc when there is a tsconfig", () => {
    const info = project({ "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }), "tsconfig.json": "{}" });
    expect(info.installs[0].label).toBe("npm install");
    expect(info.checks).toEqual([{ name: "typecheck", ecosystem: "node", cmd: "npx --no-install tsc --noEmit" }]);
  });

  it("notes invalid package.json instead of throwing", () => {
    const info = project({ "package.json": "{nope" });
    expect(info.installs).toEqual([]);
    expect(info.notes.join("\n")).toMatch(/package\.json is not valid JSON/);
  });

  it("does not claim nothing was installed when package.json exists but is invalid", () => {
    const info = project({ "package.json": "{nope" });
    expect(info.notes).toEqual(["package.json is not valid JSON; JS dependencies were not installed."]);
  });

  it("notes a null package.json instead of throwing", () => {
    const info = project({ "package.json": "null" });
    expect(info.installs).toEqual([]);
    expect(info.notes).toEqual(["package.json is not valid JSON (expected an object); JS dependencies were not installed."]);
  });
});

describe("detectProject — python", () => {
  it("installs requirements binary-only first and finds pytest", () => {
    const info = project({ "requirements.txt": "pytest==8.0\n", "requirements-dev.txt": "ruff\n" });
    expect(info.installs).toEqual([
      {
        ecosystem: "python",
        label: "pip install -r",
        safe: "python3 -m venv .venv && .venv/bin/pip install -q --only-binary=:all: -r 'requirements-dev.txt' -r 'requirements.txt'",
        withScripts: "python3 -m venv .venv && .venv/bin/pip install -q -r 'requirements-dev.txt' -r 'requirements.txt'",
      },
    ]);
    expect(info.checks).toEqual([{ name: "test", ecosystem: "python", cmd: ".venv/bin/python -m pytest -q -p no:cacheprovider" }]);
  });

  it("uses uv when there is a uv.lock and reads ruff/mypy config", () => {
    const info = project({ "pyproject.toml": "[tool.ruff]\n[tool.mypy]\n[project]\ndependencies=['pytest']\n", "uv.lock": "" });
    expect(info.installs[0].label).toBe("uv sync");
    expect(info.installs[0].safe.endsWith("uv sync --frozen --all-extras --no-build")).toBe(true);
    expect(info.checks.map((c) => c.name)).toEqual(["typecheck", "lint", "test"]);
  });

  it("detects both ecosystems", () => {
    const info = project({ "package.json": "{}", "pyproject.toml": "[project]\n" }, ["tests"]);
    expect(info.installs.map((i) => i.ecosystem)).toEqual(["node", "python"]);
    expect(info.checks).toEqual([{ name: "test", ecosystem: "python", cmd: ".venv/bin/python -m pytest -q -p no:cacheprovider" }]);
  });

  it("notes when there is nothing to install", () => {
    expect(project({}).notes.join("\n")).toMatch(/nothing was installed/);
  });

  it("notes a requirements file that makes pip build from source via --no-binary", () => {
    const info = project({ "requirements.txt": "--no-binary :all:\nrequests==2.31.0\n" });
    expect(info.notes).toEqual([
      "requirements.txt can make pip build packages from source (--no-binary), so Python install scripts may run even in the scripts-off pass.",
    ]);
  });

  it("notes an editable requirement, which pip builds from source", () => {
    const info = project({ "requirements.txt": "-e ./src\n" });
    expect(info.notes).toEqual([
      "requirements.txt can make pip build packages from source (--editable), so Python install scripts may run even in the scripts-off pass.",
    ]);
  });

  it("notes an attached -e argument, which pip also reads as editable", () => {
    const info = project({ "requirements.txt": "-evendor/pkg\n" });
    expect(info.notes).toEqual([
      "requirements.txt can make pip build packages from source (--editable), so Python install scripts may run even in the scripts-off pass.",
    ]);
  });

  it("joins backslash-continued lines before looking for build options", () => {
    const info = project({ "requirements.txt": "--no-\\\nbinary :all:\n" });
    expect(info.notes).toEqual([
      "requirements.txt can make pip build packages from source (--no-binary), so Python install scripts may run even in the scripts-off pass.",
    ]);
  });

  it("does not continue a comment line, so a backslash in a comment leaves the next line live", () => {
    const info = project({ "requirements.txt": "# x \\\n--no-binary :all:\n" });
    expect(info.notes).toEqual([
      "requirements.txt can make pip build packages from source (--no-binary), so Python install scripts may run even in the scripts-off pass.",
    ]);
  });

  it("strips every trailing backslash before joining, as pip does", () => {
    const info = project({ "requirements.txt": "--no-\\\\\nbinary :all:\n" });
    expect(info.notes).toEqual([
      "requirements.txt can make pip build packages from source (--no-binary), so Python install scripts may run even in the scripts-off pass.",
    ]);
  });

  it("treats a comment line after a continuation as ending it", () => {
    const info = project({ "requirements.txt": "--no-\\\n# c\nbinary :all:\n" });
    expect(info.notes).toEqual([]);
  });

  it("adds no pip note for plain pinned requirements", () => {
    expect(project({ "requirements.txt": "pytest==8.0\nrequests==2.31.0  # pinned\n" }).notes).toEqual([]);
  });

  it("notes local-path requirements, including a bare dot and a PEP 508 relative path", () => {
    const info = project({ "requirements.txt": "./vendor/pkg\n.\nname @ ../x\n" });
    expect(info.notes).toEqual([
      "requirements.txt can make pip build packages from source (a local path), so Python install scripts may run even in the scripts-off pass.",
    ]);
  });

  it("ignores URLs that only appear in comments", () => {
    expect(project({ "requirements.txt": "requests==2.31.0 # see https://example.com/docs\n" }).notes).toEqual([]);
  });

  it("notes a uv project whose pyproject has a build-system table", () => {
    const info = project({ "pyproject.toml": "[build-system]\nrequires = ['setuptools']\n[project]\nname = 'x'\n", "uv.lock": "" });
    expect(info.notes).toContain(UV_NOTE);
  });

  it("adds no uv note for a uv project without a build-system table", () => {
    const info = project({ "pyproject.toml": "[project]\nname = 'x'\n", "uv.lock": "" });
    expect(info.notes).toEqual([]);
  });
});
